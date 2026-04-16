import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Serves the embed loader JavaScript. The tenant pastes a tag like:
 *
 *   <script src="https://{slug}.mgic.app/api/embed/loader.js" async
 *           data-magicstudio-embed="schedule"></script>
 *
 * The script detects its own src, derives the tenant origin from it, and
 * injects a responsive iframe that renders `/embed/schedule`.
 */
export async function GET(request: NextRequest) {
  const { protocol, host } = request.nextUrl;
  const origin = `${protocol}//${host}`;

  const js = buildLoader(origin);

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

function buildLoader(defaultOrigin: string): string {
  // Escape the origin safely for a string literal.
  const safeOrigin = JSON.stringify(defaultOrigin);

  return `(function(){
  if (window.__magicstudioEmbedLoaded) return;
  window.__magicstudioEmbedLoaded = true;

  var DEFAULT_ORIGIN = ${safeOrigin};

  // Locate the currently-running script tag so we can anchor the iframe
  // right where it was placed and read its data- attributes.
  var currentScript = document.currentScript;
  if (!currentScript) {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i];
      if (s.src && s.src.indexOf('/api/embed/loader.js') !== -1) {
        currentScript = s;
        break;
      }
    }
  }
  if (!currentScript) return;

  function deriveOrigin(src) {
    try {
      var u = new URL(src, window.location.href);
      return u.protocol + '//' + u.host;
    } catch (_) {
      return DEFAULT_ORIGIN;
    }
  }

  var origin = deriveOrigin(currentScript.getAttribute('src') || '');
  var widget = (currentScript.getAttribute('data-magicstudio-embed') || 'schedule').toLowerCase();
  var targetSelector = currentScript.getAttribute('data-target');

  var validWidgets = { schedule: '/embed/schedule' };
  var path = validWidgets[widget] || validWidgets.schedule;

  // Build the iframe.
  var iframe = document.createElement('iframe');
  iframe.src = origin + path;
  iframe.title = 'Magic Studio — Schedule';
  iframe.loading = 'lazy';
  iframe.setAttribute('allow', 'clipboard-write; autoplay');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.style.cssText = [
    'width:100%',
    'border:0',
    'display:block',
    'background:transparent',
    'min-height:480px',
    'overflow:hidden',
    'color-scheme:light',
  ].join(';');

  // Wrap for predictable layout in the host page.
  var wrapper = document.createElement('div');
  wrapper.className = 'magicstudio-embed magicstudio-embed-' + widget;
  wrapper.style.cssText = 'width:100%;max-width:100%;';
  wrapper.appendChild(iframe);

  // Mount in one of: [data-target], next to the script tag, or body.
  var mount = null;
  if (targetSelector) {
    try { mount = document.querySelector(targetSelector); } catch (_) {}
  }
  if (!mount) {
    mount = currentScript.parentNode || document.body;
  }
  if (mount === currentScript.parentNode && currentScript.nextSibling) {
    mount.insertBefore(wrapper, currentScript.nextSibling);
  } else {
    mount.appendChild(wrapper);
  }

  // Auto-resize: the embed page posts its scrollHeight after every render.
  function onMessage(ev) {
    if (!ev || ev.origin !== origin) return;
    var data = ev.data;
    if (!data || data.type !== 'magicstudio:embed:resize') return;
    var h = Number(data.height);
    if (!isFinite(h) || h <= 0) return;
    iframe.style.height = Math.max(480, Math.ceil(h) + 16) + 'px';
  }
  window.addEventListener('message', onMessage, false);
})();
`;
}
