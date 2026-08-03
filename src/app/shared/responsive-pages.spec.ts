import { RESPONSIVE_PAGE_FIXTURES } from './generated-responsive-page-fixtures';

describe('Responsive pages – all templates and contents', () => {
  const initialTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300_000;
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = initialTimeout;
    window.resizeTo(500, 900);
  });

  for (const page of RESPONSIVE_PAGE_FIXTURES) {
    it(`${page.name} stays within the page from 280px to 1920px`, () => {
      if (window.innerWidth !== 500) {
        pending('Eseguire con il profilo ChromeHeadlessMobile.');
        return;
      }

      // Un iframe rende davvero disponibili anche viewport inferiori al limite
      // minimo di 500px imposto da Chrome desktop. Le media query vengono quindi
      // valutate alla larghezza esatta sottoposta ad audit.
      const frame = document.createElement('iframe');
      frame.title = `Responsive fixture ${page.name}`;
      frame.style.display = 'block';
      frame.style.height = '900px';
      frame.style.border = '0';
      document.body.appendChild(frame);
      const frameDocument = frame.contentDocument!;
      frameDocument.documentElement.style.margin = '0';
      frameDocument.documentElement.style.padding = '0';
      frameDocument.body.style.margin = '0';
      frameDocument.body.style.padding = '0';

      const sharedStyle = frameDocument.createElement('style');
      sharedStyle.textContent = Array.from(document.styleSheets).flatMap(sheet => {
        try {
          return Array.from(sheet.cssRules, rule => rule.cssText);
        } catch {
          return [];
        }
      }).join('\n');
      frameDocument.head.appendChild(sharedStyle);

      const style = frameDocument.createElement('style');
      style.dataset['responsivePageStyle'] = page.name;
      style.textContent = `${page.css}\nmat-icon { display: inline-block; width: 24px; height: 24px; overflow: hidden; }`;
      frameDocument.head.appendChild(style);

      // Riproduce l'antenato reale richiesto dalle regole del design system.
      const stage = frameDocument.createElement('app-root');
      stage.dataset['responsivePage'] = page.name;
      stage.style.position = 'relative';
      stage.style.display = 'block';
      stage.style.boxSizing = 'border-box';
      stage.style.margin = '0';
      stage.style.padding = '0';
      stage.style.minWidth = '0';
      stage.style.maxWidth = 'none';
      stage.innerHTML = page.html;
      frameDocument.body.appendChild(stage);

      stage.querySelectorAll<HTMLElement>('[\\*ngif="false" i]').forEach(
        element => element.remove(),
      );
      // Nei template grezzi i rami esclusivi di activeView finirebbero tutti
      // affiancati, mentre Angular ne materializza sempre uno solo.
      stage.querySelectorAll<HTMLElement>('*').forEach(parent => {
        const exclusive = Array.from(parent.children).filter(element =>
          /activeView\s*===/i.test(element.getAttribute('*ngif') || ''),
        );
        const groups = new Map<string, Element[]>();
        exclusive.forEach(element => {
          const key = `${element.tagName}.${element.getAttribute('class') || ''}`;
          groups.set(key, [...(groups.get(key) || []), element]);
        });
        groups.forEach(elements => elements.slice(1).forEach(element => element.remove()));
      });
      try {
        for (let width = 280; width <= 1920; width += 1) {
          frame.style.width = `${width}px`;

          const overflow = stage.scrollWidth - stage.clientWidth;
          if (overflow <= 1) continue;

          const stageRect = stage.getBoundingClientRect();
          const offender = Array.from(stage.querySelectorAll<HTMLElement>('*'))
            .find(element => {
              const style = frame.contentWindow!.getComputedStyle(element);
              if (style.display === 'none' || style.position === 'fixed') return false;
              const rect = element.getBoundingClientRect();
              return rect.left < stageRect.left - 1 || rect.right > stageRect.right + 1;
            });
          const offenderLabel = offender
            ? (() => {
                const rect = offender.getBoundingClientRect();
                const computed = frame.contentWindow!.getComputedStyle(offender);
                const ancestors = Array.from(
                  (function* () {
                    let current = offender.parentElement;
                    while (current && current !== stage) {
                      yield current;
                      current = current.parentElement;
                    }
                  })(),
                ).slice(0, 3).map(element =>
                  `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().replace(/\s+/g, '.')}` : ''}`,
                ).join(' > ');
                return `${offender.tagName.toLowerCase()}${offender.className ? `.${String(offender.className).trim().replace(/\s+/g, '.')}` : ''}` +
                  ` [${Math.round(rect.left)}..${Math.round(rect.right)}, width ${Math.round(rect.width)}, ` +
                  `position ${computed.position}, min-width ${computed.minWidth}]` +
                  (ancestors ? ` in ${ancestors}` : '');
              })()
            : 'elemento non identificato';
          const visibleOverflowSources = [stage, ...Array.from(stage.querySelectorAll<HTMLElement>('*'))]
            .map(element => {
              const computed = frame.contentWindow!.getComputedStyle(element);
              return {
                element,
                amount: element.scrollWidth - element.clientWidth,
                overflowX: computed.overflowX,
              };
            })
            .filter(item => item.amount > 1 && item.overflowX === 'visible')
            .sort((left, right) => right.amount - left.amount)
            .slice(0, 3)
            .map(item => `${item.element.tagName.toLowerCase()}${item.element.className ? `.${String(item.element.className).trim().replace(/\s+/g, '.')}` : ''}:${item.amount}px`)
            .join(', ');

          fail(
            `${page.name}: overflow orizzontale di ${overflow}px a ${width}px; ` +
            `primo elemento: ${offenderLabel}; sorgenti: ${visibleOverflowSources || 'n/d'}`,
          );
          break;
        }

        expect(true).toBeTrue();
      } finally {
        frame.remove();
      }
    });
  }
});
