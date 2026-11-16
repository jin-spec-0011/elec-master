// 안전한 DOM 생성 헬퍼. 문자열은 항상 텍스트 노드로 넣어 XSS를 막는다.

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs] class, dataset, on* 이벤트, 나머지는 속성
 * @param {...any} children 문자열·노드·배열
 * @returns {HTMLElement}
 */
export function h(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** 자식(배열 포함, null·false 제외)으로 노드 내용을 통째로 교체한다. 네이티브 append는 배열을 문자열로 바꾸므로 반드시 이 함수를 쓴다. */
export function fill(node, ...children) {
  while (node.firstChild) node.removeChild(node.firstChild);
  const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  node.append(...flat.map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return node;
}

/** 노드의 자식을 모두 제거한다. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** 우리 코드의 정적 상수 SVG 문자열만 넣을 것. 외부 입력 금지. */
export function iconNode(svgString) {
  const span = document.createElement('span');
  span.innerHTML = svgString;
  return span.firstElementChild ?? span;
}
