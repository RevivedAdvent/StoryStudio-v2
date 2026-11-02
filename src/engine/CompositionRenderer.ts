import { Application, Container, Graphics, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Layer, StoredAsset } from '../types/project';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from '../types/project';

type RenderRequest = { layers: Layer[]; assets: Record<string, StoredAsset>; selectedId: string | null };

/** Owns all Pixi resources. Layer coordinates are in composition pixels. */
export class CompositionRenderer {
  private readonly app = new Application();
  private readonly scene = new Container();
  private readonly bounds = new Graphics();
  private readonly sprites = new Map<string, Sprite>();
  private readonly textures = new Map<string, Texture>();
  private ready = false;
  private destroyed = false;
  private rendering = false;
  private queued: RenderRequest | null = null;

  constructor(private readonly reportError: (message: string) => void = () => {}) {}

  async initialize(host: HTMLElement): Promise<void> {
    await this.app.init({ width: COMPOSITION_WIDTH, height: COMPOSITION_HEIGHT, backgroundAlpha: 0, antialias: true, resolution: 1 });
    if (this.destroyed) { this.app.destroy(true); return; }
    this.app.canvas.setAttribute('aria-label', '1920 by 1080 composition preview');
    this.app.canvas.dataset.testid = 'composition-canvas';
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.scene);
    this.scene.addChild(this.bounds);
    this.scene.eventMode = 'none';
    this.ready = true;
  }

  async render(layers: Layer[], assets: Record<string, StoredAsset>, selectedId: string | null): Promise<void> {
    if (!this.ready || this.destroyed) return;
    this.queued = { layers, assets, selectedId };
    if (this.rendering) return;
    this.rendering = true;
    try {
      while (this.queued && !this.destroyed) {
        const request = this.queued;
        this.queued = null;
        await this.apply(request);
      }
    } finally { this.rendering = false; }
  }

  private async apply({ layers, assets, selectedId }: RenderRequest): Promise<void> {
    const ids = new Set(layers.map(layer => layer.id));
    const usedAssets = new Set(layers.map(layer => layer.assetId));
    for (const [id, sprite] of this.sprites) {
      if (!ids.has(id)) { sprite.removeFromParent(); sprite.destroy(); this.sprites.delete(id); }
    }
    for (const [id, texture] of this.textures) {
      if (!usedAssets.has(id)) { texture.destroy(true); this.textures.delete(id); }
    }
    for (const layer of layers) {
      if (this.destroyed || this.queued) return;
      const asset = assets[layer.assetId];
      if (!asset?.blob) { const old = this.sprites.get(layer.id); if (old) { old.removeFromParent(); old.destroy(); this.sprites.delete(layer.id); } this.reportError(`Missing image for layer “${layer.name}”.`); continue; }
      let texture = this.textures.get(layer.assetId);
      if (!texture) {
        try {
          const image = await decodeAsset(asset.blob);
          if (this.destroyed) return;
          texture = new Texture({ source: new ImageSource({ resource: image }) });
          this.textures.set(layer.assetId, texture);
        } catch {
          this.reportError(`Could not display image for layer “${layer.name}”.`);
          continue;
        }
      }
      let sprite = this.sprites.get(layer.id);
      if (!sprite) {
        sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        this.sprites.set(layer.id, sprite);
        this.scene.addChild(sprite);
      }
      sprite.position.set(layer.x, layer.y);
      sprite.scale.set(layer.scale);
      sprite.rotation = layer.rotation * Math.PI / 180;
      sprite.alpha = layer.opacity;
      sprite.visible = layer.visible;
    }
    // Last layer is in front. Missing assets do not leave gaps in child indices.
    let index = 0;
    for (const layer of layers) {
      const sprite = this.sprites.get(layer.id);
      if (sprite) this.scene.setChildIndex(sprite, index++);
    }
    this.scene.setChildIndex(this.bounds, this.scene.children.length - 1);
    const selected = layers.find(layer => layer.id === selectedId && layer.visible && this.sprites.has(layer.id));
    this.bounds.clear();
    if (selected) {
      this.bounds.position.set(selected.x, selected.y);
      this.bounds.rotation = selected.rotation * Math.PI / 180;
      const width = selected.width * selected.scale;
      const height = selected.height * selected.scale;
      this.bounds.rect(-width / 2, -height / 2, width, height).stroke({ color: 0xd4ad73, width: 3 });
    }
  }

  /** Extract exactly the composition frame, without selection bounds or editor UI. */
  async exportPng(): Promise<Blob> {
    if (!this.ready || this.rendering || this.destroyed) throw new Error('Composition renderer is not ready.');
    const visible = this.bounds.visible;
    this.bounds.visible = false;
    try {
      const canvas = this.app.renderer.extract.canvas({ target: this.scene, frame: new Rectangle(0, 0, COMPOSITION_WIDTH, COMPOSITION_HEIGHT), resolution: 1, clearColor: '#000000', antialias: true }) as HTMLCanvasElement;
      if (canvas.width !== COMPOSITION_WIDTH || canvas.height !== COMPOSITION_HEIGHT) throw new Error('Unexpected composition dimensions.');
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'));
    } finally { this.bounds.visible = visible; }
  }

  destroy(): void {
    this.destroyed = true;
    this.queued = null;
    if (this.ready) this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    for (const texture of this.textures.values()) texture.destroy(true);
    this.sprites.clear();
    this.textures.clear();
  }
}

async function decodeAsset(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}
