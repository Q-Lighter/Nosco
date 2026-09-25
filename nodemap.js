// nodemap.js — renders the person-to-person connection graph using D3-force,
// loaded as a plain script tag in index.html. Draggable nodes, click to open a profile.

let simulation = null;

export function renderNodeMap(svg, data, { width, height, onNodeClick }) {
  if (typeof d3 === 'undefined') { console.warn('Nosco: D3 did not load — skipping node map.'); return; }
  if (simulation) { simulation.stop(); simulation = null; }

  const nodes = data.dossier.map((p) => ({ id: p.id, name: p.name }));
  const validIds = new Set(nodes.map((n) => n.id));
  const links = data.links
    .filter((l) => validIds.has(l.a) && validIds.has(l.b))
    .map((l) => ({ source: l.a, target: l.b }));

  const svgSel = d3.select(svg).attr('viewBox', `0 0 ${width} ${height}`);
  svgSel.selectAll('*').remove();
  if (nodes.length === 0) return;

  const g = svgSel.append('g');

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(95))
    .force('charge', d3.forceManyBody().strength(-230))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(38));

  const link = g.append('g')
    .attr('stroke', '#2a2d2e')
    .attr('stroke-width', 1.2)
    .selectAll('line')
    .data(links)
    .join('line');

  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .style('cursor', 'pointer')
    .call(dragBehaviour(simulation));

  node.append('circle')
    .attr('r', 20)
    .attr('fill', '#131516')
    .attr('stroke', '#b0935a')
    .attr('stroke-width', 1.5);

  node.append('text')
    .text((d) => initials(d.name))
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('fill', '#b0935a')
    .attr('font-family', 'IBM Plex Mono, monospace')
    .attr('font-size', '11px')
    .style('pointer-events', 'none');

  node.append('text')
    .text((d) => d.name)
    .attr('text-anchor', 'middle')
    .attr('dy', '34px')
    .attr('fill', '#8d9093')
    .attr('font-family', 'Inter, sans-serif')
    .attr('font-size', '11px')
    .style('pointer-events', 'none');

  node.on('click', (event, d) => { if (!event.defaultPrevented) onNodeClick(d.id); });

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('');
}

function dragBehaviour(sim) {
  function started(event, d) {
    if (!event.active) sim.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
  function ended(event, d) {
    if (!event.active) sim.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
  return d3.drag().on('start', started).on('drag', dragged).on('end', ended);
}
