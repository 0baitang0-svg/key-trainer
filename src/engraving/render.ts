/**
 * DOM 挂载小工具：把 buildStaff 的 SVG 内容挂到容器 / SVG 元素上。
 */

import { buildStaff, StaffOptions, STAFF_VIEWBOX } from './staff';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 在容器内创建并渲染一张谱表，返回 <svg> 元素（替换容器原有内容） */
export function renderStaff(container: HTMLElement, opts: StaffOptions): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', STAFF_VIEWBOX);
  svg.setAttribute('role', 'img');
  svg.classList.add('staff');
  svg.innerHTML = buildStaff(opts);
  container.replaceChildren(svg);
  return svg;
}

/** 刷新一个已有 <svg> 元素内的谱表内容（保留元素本身，适合动画复用） */
export function renderStaffInto(svg: SVGSVGElement, opts: StaffOptions): void {
  svg.innerHTML = buildStaff(opts);
}
