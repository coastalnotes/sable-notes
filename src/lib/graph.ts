import type { Note } from "./types";

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  degree: number;
  highlighted?: boolean;
}

export interface GraphLink {
  source: GraphNode;
  target: GraphNode;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export function buildGraphData(notes: Note[]): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  const titleMap = new Map<string, GraphNode>();

  // Center coordinates initially in a spiral / circle
  const count = notes.length;
  const radius = Math.min(260, 40 + count * 15);

  notes.forEach((note, i) => {
    const angle = (i / Math.max(1, count)) * 2 * Math.PI;
    const r = radius * (0.4 + 0.6 * Math.sqrt((i + 1) / count));
    const node: GraphNode = {
      id: note.id,
      title: note.title || "Untitled",
      tags: note.tags,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      radius: 6,
      degree: 0,
    };
    nodeMap.set(note.id, node);
    titleMap.set(note.title.trim().toLowerCase(), node);
  });

  const links: GraphLink[] = [];
  const linkKeySet = new Set<string>();

  const wikiRegex = /\[\[([^\][|]+)(?:\|[^\]]+)?\]\]/g;

  for (const note of notes) {
    const sourceNode = nodeMap.get(note.id);
    if (!sourceNode) continue;

    for (const match of note.body.matchAll(wikiRegex)) {
      const targetTitle = match[1].trim().toLowerCase();
      const targetNode = titleMap.get(targetTitle);
      if (targetNode && targetNode.id !== sourceNode.id) {
        const key = [sourceNode.id, targetNode.id].sort().join("->");
        if (!linkKeySet.has(key)) {
          linkKeySet.add(key);
          links.push({ source: sourceNode, target: targetNode });
          sourceNode.degree++;
          targetNode.degree++;
        }
      }
    }
  }

  // Adjust node radius based on connection degree
  for (const node of nodeMap.values()) {
    node.radius = Math.min(18, Math.max(5, 5 + node.degree * 2));
  }

  return { nodes: [...nodeMap.values()], links };
}

export interface GraphViewOptions {
  onSelectNote(noteId: string): void;
}

export class NoteGraphCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: GraphData = { nodes: [], links: [] };
  private animId: number | null = null;
  private transform = { x: 0, y: 0, scale: 1 };
  private hoveredNode: GraphNode | null = null;
  private draggedNode: GraphNode | null = null;
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private filter = "";
  private isRunning = true;

  constructor(
    private container: HTMLElement,
    private options: GraphViewOptions,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;

    this.resize();
    this.bindEvents();
  }

  setNotes(notes: Note[]): void {
    this.data = buildGraphData(notes);
    this.centerView();
    this.restartSimulation();
  }

  setFilter(filterText: string): void {
    this.filter = filterText.trim().toLowerCase();
    for (const node of this.data.nodes) {
      node.highlighted = this.filter
        ? node.title.toLowerCase().includes(this.filter) ||
          node.tags.some((t) => t.toLowerCase().includes(this.filter))
        : false;
    }
  }

  private centerView(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.transform.x = rect.width / 2;
    this.transform.y = rect.height / 2;
    this.transform.scale = 1;
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(100, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(100, Math.floor(rect.height * dpr));
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => {
      this.resize();
    });

    this.canvas.addEventListener("mousedown", (e) => {
      const { x, y } = this.screenToWorld(e.offsetX, e.offsetY);
      const node = this.findNodeAt(x, y);
      if (node) {
        this.draggedNode = node;
      } else {
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.draggedNode) {
        const rect = this.canvas.getBoundingClientRect();
        const { x, y } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.draggedNode.x = x;
        this.draggedNode.y = y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
        this.restartSimulation();
      } else if (this.isPanning) {
        this.transform.x = e.clientX - this.panStart.x;
        this.transform.y = e.clientY - this.panStart.y;
      } else {
        const rect = this.canvas.getBoundingClientRect();
        const { x, y } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const node = this.findNodeAt(x, y);
        if (this.hoveredNode !== node) {
          this.hoveredNode = node;
          this.canvas.style.cursor = node ? "pointer" : "default";
        }
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.draggedNode) {
        const rect = this.canvas.getBoundingClientRect();
        const { x, y } = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const startDist = Math.hypot(this.draggedNode.x - x, this.draggedNode.y - y);
        // If release was basically a click, navigate!
        if (startDist < 5) {
          this.options.onSelectNote(this.draggedNode.id);
        }
        this.draggedNode = null;
      }
      this.isPanning = false;
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
        const newScale = Math.min(3, Math.max(0.2, this.transform.scale * zoomFactor));

        const mouseX = e.offsetX;
        const mouseY = e.offsetY;

        this.transform.x = mouseX - (mouseX - this.transform.x) * (newScale / this.transform.scale);
        this.transform.y = mouseY - (mouseY - this.transform.y) * (newScale / this.transform.scale);
        this.transform.scale = newScale;
      },
      { passive: false },
    );
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.transform.x) / this.transform.scale,
      y: (sy - this.transform.y) / this.transform.scale,
    };
  }

  private findNodeAt(wx: number, wy: number): GraphNode | null {
    for (let i = this.data.nodes.length - 1; i >= 0; i--) {
      const node = this.data.nodes[i];
      const dist = Math.hypot(node.x - wx, node.y - wy);
      if (dist <= node.radius + 6) return node;
    }
    return null;
  }

  private restartSimulation(): void {
    if (!this.isRunning) return;
    if (this.animId != null) cancelAnimationFrame(this.animId);
    let stepCount = 0;

    const tick = () => {
      this.stepPhysics();
      this.render();
      stepCount++;
      // Gradually settle after nodes find balance
      if (stepCount < 300 || this.draggedNode || this.hoveredNode) {
        this.animId = requestAnimationFrame(tick);
      } else {
        this.animId = null;
      }
    };
    this.animId = requestAnimationFrame(tick);
  }

  private stepPhysics(): void {
    const nodes = this.data.nodes;
    const links = this.data.links;
    const len = nodes.length;
    if (len === 0) return;

    // Repulsion between all nodes
    for (let i = 0; i < len; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < len; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 40;
        const dist = Math.sqrt(distSq);
        const force = 1200 / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Spring attraction along links
    const targetLength = 60;
    for (const link of links) {
      const a = link.source;
      const b = link.target;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const delta = dist - targetLength;
      const force = delta * 0.04;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Centering gravity & damping
    for (const node of nodes) {
      if (node === this.draggedNode) continue;
      node.vx -= node.x * 0.008;
      node.vy -= node.y * 0.008;

      node.vx *= 0.85;
      node.vy *= 0.85;

      node.x += node.vx;
      node.y += node.vy;
    }
  }

  private render(): void {
    const rect = this.container.getBoundingClientRect();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.scale, this.transform.scale);

    // Connected neighbor set for hover highlight
    const neighborSet = new Set<string>();
    if (this.hoveredNode) {
      neighborSet.add(this.hoveredNode.id);
      for (const link of this.data.links) {
        if (link.source.id === this.hoveredNode.id) neighborSet.add(link.target.id);
        if (link.target.id === this.hoveredNode.id) neighborSet.add(link.source.id);
      }
    }

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const defaultLinkColor = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";
    const highlightLinkColor = isDark ? "rgba(224, 93, 56, 0.85)" : "rgba(224, 93, 56, 0.75)";
    const defaultNodeColor = isDark ? "#c2bdb3" : "#6e685f";
    const accentColor = "#e05d38";
    const textColor = isDark ? "#ece7dd" : "#2b2620";

    // Draw Links
    for (const link of this.data.links) {
      const isConnected =
        this.hoveredNode &&
        (link.source.id === this.hoveredNode.id || link.target.id === this.hoveredNode.id);

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isConnected ? highlightLinkColor : defaultLinkColor;
      ctx.lineWidth = isConnected ? 2 : 1;
      ctx.stroke();
    }

    // Draw Nodes
    for (const node of this.data.nodes) {
      const isHovered = this.hoveredNode === node;
      const isNeighbor = neighborSet.has(node.id);
      const isDimmed = this.hoveredNode && !isNeighbor;
      const isFilteredMatch = node.highlighted;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.25 : 1;

      // Outer glow/ring for search match or hover
      if (isFilteredMatch || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(224, 93, 56, 0.25)";
        ctx.fill();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Main node body
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.degree > 0 || isFilteredMatch ? accentColor : defaultNodeColor;
      ctx.fill();

      // Node label
      const showLabel = this.transform.scale > 0.6 || isHovered || isNeighbor || isFilteredMatch;
      if (showLabel) {
        ctx.font = `${isHovered ? "600" : "400"} 12px var(--font-stack, -apple-system, sans-serif)`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHovered || isFilteredMatch ? accentColor : textColor;
        ctx.fillText(node.title, node.x, node.y + node.radius + 4);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animId != null) cancelAnimationFrame(this.animId);
    this.canvas.remove();
  }
}
