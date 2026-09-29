/** HTML/SVG grid viewport of the compound block */
export class Renderer {
  render(solverResult, containerId) {
    const { subBlocks, poles, paths } = solverResult;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '800');
    svg.setAttribute('height', '600');
    svg.style.background = '#1e1e2e';

    // Background grid
    for (let x = 0; x < 100; x += 2) {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x * 8); line.setAttribute('y1', 0);
      line.setAttribute('x2', x * 8); line.setAttribute('y2', 600);
      line.setAttribute('stroke', '#333'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    for (let y = 0; y < 100; y += 2) {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', 0); line.setAttribute('y1', y * 6);
      line.setAttribute('x2', 800); line.setAttribute('y2', y * 6);
      line.setAttribute('stroke', '#333'); line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    // Sub-blocks
    subBlocks.forEach(sb => {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', sb.x * 8);
      rect.setAttribute('y', sb.y * 6);
      rect.setAttribute('width', 48); rect.setAttribute('height', 36);
      rect.setAttribute('fill', '#5588aa'); rect.setAttribute('opacity', '0.7');
      rect.setAttribute('rx', 4);
      svg.appendChild(rect);
      // Label
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', sb.x * 8 + 4); text.setAttribute('y', sb.y * 6 + 14);
      text.setAttribute('fill', '#fff'); text.setAttribute('font-size', '10');
      text.textContent = sb.recipe;
      svg.appendChild(text);
    });

    // Poles
    poles.forEach(p => {
      const circ = document.createElementNS(svgNS, 'circle');
      circ.setAttribute('cx', p.x * 8 + 4); circ.setAttribute('cy', p.y * 6 + 3);
      circ.setAttribute('r', 3); circ.setAttribute('fill', '#ffcc00');
      svg.appendChild(circ);
    });

    // Paths (belts / pipes)
    paths.forEach(path => {
      const color = path.type === 'pipe' ? '#55aaff' : '#ffaa55';
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', path.from.x * 8 + 4); line.setAttribute('y1', path.from.y * 6 + 3);
      line.setAttribute('x2', path.to.x * 8 + 4); line.setAttribute('y2', path.to.y * 6 + 3);
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', '3');
      svg.appendChild(line);
    });

    const container = document.getElementById(containerId);
    if (container) { container.innerHTML = ''; container.appendChild(svg); }
  }
}
