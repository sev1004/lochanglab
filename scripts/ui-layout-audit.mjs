/** Read-only DOM audit. Pass this function to the browser skill's evaluate(). */
export function auditUiLayout() {
  const issues = [];
  const checked = [];
  const tolerance = 1;
  const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const all = selector => [...document.querySelectorAll(selector)].filter(visible);
  const rect = e => e.getBoundingClientRect();
  const issue = (rule, selector, detail) => issues.push({ rule, selector, detail });
  const shell = document.querySelector('.simulator-shell');
  const workspace = document.querySelector('.simulation-workspace');
  if (!shell || !workspace) {
    return { status: 'incomplete', issues: [{ rule: 'fixture', detail: 'Load a character before auditing.' }] };
  }
  for (const e of all('.simulator-shell, .floating-doping-panel, .floating-cycle-ratio-panel')) {
    const style = getComputedStyle(e);
    if (Number(style.zoom || 1) !== 1 || style.transform !== 'none') {
      issue('no-scale', e.className, 'Layout container uses zoom/transform.');
    }
  }
  checked.push('no-scale');
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance) {
    issue('document-overflow', 'html', 'Document has horizontal overflow');
  }
  checked.push('document-overflow');
  const w = rect(workspace);
  for (const [selector, side, token] of [
    ['.floating-doping-panel', 'left', '--ui-panel-gap-left'],
    ['.floating-cycle-ratio-panel', 'right', '--ui-panel-gap-right'],
  ]) {
    const e = document.querySelector(selector);
    if (!e || !visible(e)) { issue('panel-missing', selector, 'Panel not rendered'); continue; }
    const p = rect(e);
    if (getComputedStyle(e).position === 'fixed') {
      const gap = side === 'left' ? w.left - p.right : p.left - w.right;
      const expected = Number(getComputedStyle(document.documentElement).getPropertyValue(token).replace('px', '').trim());
      if (Math.abs(gap - expected) > tolerance) issue('panel-gap', selector, { gap, expected });
      if (p.left < -tolerance || p.right > document.documentElement.clientWidth + tolerance) {
        issue('panel-viewport', selector, 'Panel extends beyond viewport');
      }
    }
    for (const child of e.querySelectorAll('input,select')) {
      if (!visible(child) || child.type === 'file') continue;
      const c = rect(child);
      if (c.left < p.left - tolerance || c.right > p.right + tolerance || c.bottom > p.bottom + tolerance) {
        issue('panel-control-clipping', selector, child.getAttribute('aria-label') || child.tagName);
      }
    }
  }
  checked.push('panel-gap', 'panel-viewport', 'panel-control-clipping');
  for (const selector of ['.header-character-search', '.cycle-preset-actions', '.cycle-use-count', '.cycle-duration-option']) {
    for (const row of all(selector)) {
      const controls = [...row.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,button')].filter(visible);
      const boxes = controls.map(rect);
      if (boxes.length > 1 && Math.max(...boxes.map(b => b.height)) - Math.min(...boxes.map(b => b.height)) > tolerance) {
        issue('control-height', selector, boxes.map(b => b.height));
      }
      for (const b of boxes) {
        const r = rect(row);
        if (Math.abs((b.top + b.bottom - r.top - r.bottom) / 2) > tolerance) {
          issue('control-center', selector, 'Control not vertically centered');
        }
      }
    }
  }
  const stage = document.querySelector('.flash-orb-control select');
  const uptime = document.querySelector('.flash-orb-uptime input');
  if (stage && uptime && visible(stage) && visible(uptime)) {
    const a = rect(stage), b = rect(uptime);
    if (Math.abs(a.left - b.left) > tolerance || Math.abs(a.width - b.width) > tolerance) {
      issue('flash-orb-columns', '.flash-orb-control', 'Select and uptime input must share left edge and width');
    }
  }
  checked.push('control-height', 'control-center', 'flash-orb-columns');
  // Compare complete rows (label + input included), not every control on the page.
  for (const group of all('[data-ui-width-group], .gear-fields:not(.no-quality)')) {
    const rows = [...group.children].filter(e => visible(e) &&
      (e.hasAttribute('data-ui-width-row') ||
        (group.matches('.gear-fields') && e.matches('select,label'))));
    const selector = group.getAttribute('data-ui-width-group') || group.className;
    if (rows.length < 2) {
      issue('equal-row-width', selector, 'Width group requires at least two visible rows.');
      continue;
    }
    const reference = rect(rows[0]);
    const bounds = rect(group);
    for (const row of rows) {
      const box = rect(row);
      if (Math.abs(box.left - reference.left) > tolerance || Math.abs(box.right - reference.right) > tolerance) {
        issue('equal-row-width', selector, { expectedWidth: reference.width, actualWidth: box.width });
      }
      if (box.left < bounds.left - tolerance || box.right > bounds.right + tolerance) {
        issue('width-group-overflow', selector, 'Row extends beyond its group.');
      }
    }
  }
  checked.push('equal-row-width', 'width-group-overflow');
  for (const card of all('.skill-editor')) {
    const cardRect = rect(card);
    const canScrollHorizontally = ['auto', 'scroll'].includes(
      getComputedStyle(card).overflowX,
    );
    if (
      canScrollHorizontally &&
      card.scrollWidth > card.clientWidth + tolerance
    ) {
      issue('skill-card-overflow', '.skill-editor', {
        clientWidth: card.clientWidth,
        scrollWidth: card.scrollWidth,
      });
    }
    const parts = [
      '.skill-icon-column',
      '.skill-title-column',
      '.skill-tripod-selects',
      '.skill-gem-inline',
      '.skill-metrics',
    ].map(selector => card.querySelector(selector)).filter(part => part && visible(part));
    for (const part of parts) {
      const partRect = rect(part);
      for (const child of [...part.querySelectorAll('select,button,.compact-art,b,strong')].filter(visible)) {
        const c = rect(child);
        if (c.left < partRect.left - tolerance || c.right > partRect.right + tolerance || c.bottom > partRect.bottom + tolerance) {
          issue('skill-child-containment', part.className, child.getAttribute('aria-label') || child.className || child.tagName);
        }
        if (child.matches('b,strong,button') && child.scrollWidth > child.clientWidth + tolerance) {
          issue('skill-text-clipping', part.className, child.textContent);
        }
      }
      if (
        partRect.left < cardRect.left - tolerance ||
        partRect.right > cardRect.right + tolerance ||
        partRect.top < cardRect.top - tolerance ||
        partRect.bottom > cardRect.bottom + tolerance
      ) {
        issue('skill-card-containment', '.skill-editor', part.className);
      }
    }
    for (let index = 0; index < parts.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < parts.length; nextIndex += 1) {
        const first = rect(parts[index]);
        const second = rect(parts[nextIndex]);
        const overlaps =
          Math.min(first.right, second.right) - Math.max(first.left, second.left) > tolerance &&
          Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > tolerance;
        if (overlaps) {
          issue('skill-card-overlap', '.skill-editor', {
            first: parts[index].className,
            second: parts[nextIndex].className,
          });
        }
      }
    }
  }
  checked.push('skill-card-overflow', 'skill-card-containment', 'skill-card-overlap');
  const equipmentSections = [...document.querySelectorAll('.sim-content .equipment-section')]
    .filter(visible)
    .reduce((map, section) => {
      const title = section.querySelector('h2')?.textContent?.trim();
      if (title) map[title] = section;
      return map;
    }, {});
  if (equipmentSections['전투 장비'] && equipmentSections['악세사리'] && equipmentSections['각인'] && equipmentSections['아바타']) {
    const combat = rect(equipmentSections['전투 장비']);
    const accessory = rect(equipmentSections['악세사리']);
    const engraving = rect(equipmentSections['각인']);
    const avatar = rect(equipmentSections['아바타']);
    const ark = document.querySelector('.equipment-ark-grid > section:last-child');
    const arkRect = ark && visible(ark) ? rect(ark) : null;
    // Measure visible panel borders, not the empty space in their parent column.
    if (innerWidth > 900 && equipmentSections['팔찌'] && arkRect) {
      const bracelet = rect(equipmentSections['팔찌']);
      const bottoms = [combat.bottom, bracelet.bottom, arkRect.bottom];
      if (Math.max(...bottoms) - Math.min(...bottoms) > tolerance) {
        issue('basic-equipment-bottoms', '.equipment-section', { combat: combat.bottom, bracelet: bracelet.bottom, ark: arkRect.bottom });
      }
    }
    if (Math.abs(engraving.top - accessory.top) > tolerance || engraving.left <= accessory.right + tolerance) {
      issue('basic-equipment-placement', '.engraving-section', 'Engraving must be in the top-right column beside accessories.');
    }
    if (Math.abs(avatar.left - combat.left) > tolerance || avatar.top <= combat.bottom - tolerance) {
      issue('basic-equipment-placement', '.avatar-section', 'Avatar must be below combat equipment in the left column.');
    }
    const expectedArkGap = Number(getComputedStyle(document.documentElement).getPropertyValue('--basic-equipment-section-gap').replace('px', '').trim()) || 0;
    if (!arkRect || Math.abs(arkRect.left - engraving.left) > tolerance || Math.abs(arkRect.top - engraving.bottom - expectedArkGap) > tolerance) {
      issue('basic-equipment-placement', '.equipment-ark-grid', { expectedArkGap, actualArkGap: arkRect ? arkRect.top - engraving.bottom : null });
    }
    const coreCards = ark?.querySelector('.core-grid');
    if (coreCards && getComputedStyle(coreCards).gridTemplateColumns.split(' ').length !== 2) {
      issue('basic-equipment-placement', '.core-grid', 'Ark Grid cores must use two columns on desktop.');
    }
    for (const card of equipmentSections['각인'].querySelectorAll('.engraving-editor > div')) {
      if (card.scrollWidth > card.clientWidth + tolerance) {
        issue('basic-equipment-placement', '.engraving-editor > div', 'Engraving or ability-stone card is horizontally clipped.');
      }
    }
    checked.push('basic-equipment-placement');
  }
  return { status: issues.length ? 'failed' : 'passed', viewport: { width: innerWidth, height: innerHeight }, checked, issues };
}
