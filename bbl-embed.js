(function () {
  // Guard against double initialization
  var oldOverlay = document.getElementById('bbl-overlay');
  var oldWasVisible = oldOverlay && oldOverlay.classList.contains('visible');
  if (oldOverlay) oldOverlay.remove();

  // StudioYouEmbed calls scrollIntoView('#studioyou-embed') on every RouteChanged
  var embedEl = document.querySelector('#studioyou-embed');
  if (embedEl) embedEl.scrollIntoView = function () {};

  // --- Overlay styles ---
  var s = document.createElement('style');
  s.textContent = '#bbl-overlay{position:fixed;left:0;right:0;bottom:0;top:0;background:rgb(209,203,193);z-index:9;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none}#bbl-overlay.visible{opacity:1;pointer-events:auto}';
  document.head.appendChild(s);

  // --- Overlay DOM — SVG Megaformer Loading Animation ---
  var overlay = document.createElement('div');
  overlay.id = 'bbl-overlay';
  overlay.innerHTML = '<svg style="width:800px;max-width:75vw" viewBox="0 0 375 110" xmlns="http://www.w3.org/2000/svg">'
    + '<defs>'
    + '<linearGradient x1="1%" y1="44%" x2="100%" y2="44%" id="gr1"><stop stop-color="#333" offset="0%"/><stop stop-color="#666" offset="52%"/><stop stop-color="#333" offset="100%"/></linearGradient>'
    + '<linearGradient x1="1%" y1="44%" x2="100%" y2="44%" id="gr2"><stop stop-color="#333" offset="0%"/><stop stop-color="#666" offset="52%"/><stop stop-color="#333" offset="100%"/></linearGradient>'
    + '</defs>'
    + '<g stroke="none" fill="none" fill-rule="evenodd">'
    + '<g transform="translate(38,31)">'
    + '<rect fill="#2B3036" width="29" height="47" rx="3"/>'
    + '<rect fill="#FFF" x="14" y="2" width="1" height="19"/>'
    + '<rect fill="#FFF" x="14" y="26" width="1" height="19"/>'
    + '<rect fill="#FFF" x="17" y="22.95" width="8" height="1"/>'
    + '<rect fill="#FFF" x="3" y="22.95" width="8" height="1"/>'
    + '</g>'
    + '<g transform="translate(14,10.138)">'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" points="275.453 9.973 274 14.862 271.137 14.862 273.656 6.707"/>'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" transform="translate(57.812,10.784) scale(-1,1) translate(-57.812,-10.784)" points="60.453 6.707 58.035 14.862 55.172 14.862 57.691 6.707"/>'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" transform="translate(57.812,76.784) scale(-1,-1) translate(-57.812,-76.784)" points="60.453 72.707 58.035 80.862 55.172 80.862 57.691 72.707"/>'
    + '<polygon stroke="#222" stroke-width="0.6" fill="#000" stroke-linejoin="round" transform="translate(273.473,74.784) scale(1,-1) translate(-273.473,-74.784)" points="275.809 73.172 274 78.862 271.137 78.862 273.656 70.707"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M300.769,66.707L297.932,67.912L305.405,80.862L282.119,81.14C285.058,72.449,286.67,67.683,286.954,66.842L286.989,66.74C286.996,66.718,287,66.707,287,66.707H300.769ZM296.003,69.973H288.489L287.742,71.859H297L296.003,69.973Z" transform="translate(293.762,73.923) scale(1,-1) translate(-293.762,-73.923)"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M45.769,66.707L42.932,67.912L50.405,80.862L27.119,81.14C30.058,72.449,31.67,67.683,31.954,66.842L31.989,66.74C31.996,66.718,32,66.707,32,66.707H45.769ZM41.003,69.973H33.489L32.742,71.859H42L41.003,69.973Z" transform="translate(38.762,73.923) scale(-1,-1) translate(-38.762,-73.923)"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M300.769,6.707L297.932,7.912L305.405,20.862L282.119,21.14C285.058,12.449,286.67,7.683,286.954,6.842L286.989,6.74C286.996,6.718,287,6.707,287,6.707H300.769ZM296.003,9.973H288.489L287.742,11.859H297L296.003,9.973Z"/>'
    + '<path stroke="#222" stroke-width="0.5" fill="#000" stroke-linejoin="round" d="M45.769,6.707L42.932,7.912L50.405,20.862L27.119,21.14C30.058,12.449,31.67,7.683,31.954,6.842L31.989,6.74C31.996,6.718,32,6.707,32,6.707H45.769ZM41.003,9.973H33.489L32.742,11.859H42L41.003,9.973Z" transform="translate(38.762,13.923) scale(-1,1) translate(-38.762,-13.923)"/>'
    + '<rect fill="#000" x="46" y="7.862" width="241" height="1.6"/>'
    + '<rect fill="#000" x="41" y="78.862" width="235" height="1.6"/>'
    + '<rect fill="#000" x="48" y="14.862" width="238" height="6" rx="2"/>'
    + '<rect fill="#000" x="48" y="65.862" width="239" height="6" rx="2"/>'
    + '<path stroke="#2B3036" fill="#3B3D40" d="M49.062,13.883V16.825L24.733,17.096C23.745,17.402,22.861,17.918,22.082,18.645C21.319,19.357,20.62,20.308,19.99,21.503V66.375C20.486,67.585,21.18,68.632,22.071,69.516C22.975,70.412,23.964,71.025,25.035,71.362H49.414V74.57H25.164C22.844,74.086,21.075,73.248,19.874,72.03C18.082,70.211,16.944,67.776,16.944,66.275V21.628C16.944,20.155,17.475,18.78,19.025,17.071C20.589,15.346,23.402,13.883,24.813,13.883H49.062Z"/>'
    + '<path stroke="#2B3036" fill="#3B3D40" d="M316.062,13.883V16.825L291.733,17.096C290.745,17.402,289.861,17.918,289.082,18.645C288.319,19.357,287.62,20.308,286.99,21.503V66.375C287.486,67.585,288.18,68.632,289.071,69.516C289.975,70.412,290.964,71.025,292.035,71.362H316.414V74.57H292.164C289.844,74.086,288.075,73.248,286.874,72.03C285.082,70.211,283.944,67.776,283.944,66.275V21.628C283.944,20.155,284.475,18.78,286.025,17.071C287.589,15.346,290.402,13.883,291.813,13.883H316.062Z" transform="translate(300.179,44.226) rotate(180) translate(-300.179,-44.226)"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M274,6.362L288.049,1.97L329.35,1.432L344.987,0C345.65,0.556,345.982,1.519,345.982,2.888C345.982,4.257,345.702,5.102,345.141,5.422L329.492,6.362H288.312L274,10.362V6.362Z"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M0,6.362L14.049,1.97L55.35,1.432L70.987,0C71.65,0.556,71.982,1.519,71.982,2.888C71.982,4.257,71.702,5.102,71.141,5.422L55.492,6.362H14.312L0,10.362V6.362Z" transform="translate(35.991,5.181) scale(-1,1) translate(-35.991,-5.181)"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M274,85.478L291.576,79.506H328.421L345.704,76C346.367,76.556,346.698,77.519,346.698,78.888C346.698,80.257,346.418,81.102,345.858,81.422L328.421,84.539L291.576,84.297L274,89.478V85.478Z" transform="translate(310.349,82.739) scale(1,-1) translate(-310.349,-82.739)"/>'
    + '<path stroke="#222" fill="#3B3D40" stroke-linejoin="round" d="M0,85.478L17.576,79.506H54.421L71.704,76C72.367,76.556,72.698,77.519,72.698,78.888C72.698,80.257,72.418,81.102,71.858,81.422L54.421,84.539L17.576,84.297L0,89.478V85.478Z" transform="translate(36.349,82.739) scale(-1,-1) translate(-36.349,-82.739)"/>'
    + '<rect fill="url(#gr1)" x="57" y="13.862" width="4" height="59"/>'
    + '<rect fill="url(#gr1)" x="272" y="13.862" width="4" height="59"/>'
    + '</g>'
    + '<g transform="translate(294,31)">'
    + '<rect fill="#2B3036" width="29" height="47" rx="3"/>'
    + '<rect fill="#FFF" x="14" y="2" width="1" height="19"/>'
    + '<rect fill="#FFF" x="14" y="26" width="1" height="19"/>'
    + '<rect fill="#FFF" x="17" y="22.95" width="8" height="1"/>'
    + '<rect fill="#FFF" x="3" y="22.95" width="8" height="1"/>'
    + '</g>'
    + '<g transform="translate(79,16.5)">'
    + '<animateTransform attributeName="transform" type="translate" values="79,16.5;184,16.5;184,16.5;79,16.5" keyTimes="0;0.4;0.6;1" dur="4s" repeatCount="indefinite"/>'
    + '<g>'
    + '<rect fill="#818181" x="99" y="0.5" width="12" height="12" rx="3"/>'
    + '<rect fill="#000" x="1" y="0.5" width="12" height="12" rx="3"/>'
    + '<rect fill="#818181" x="99" y="63.5" width="12" height="12" rx="3"/>'
    + '<rect fill="#000" x="1" y="63.5" width="12" height="12" rx="3"/>'
    + '<rect fill="url(#gr1)" x="0" y="7.5" width="4" height="59"/>'
    + '<rect fill="url(#gr1)" x="106" y="7.5" width="4" height="59"/>'
    + '<rect fill="url(#gr2)" x="52" y="-45.5" width="4" height="95" transform="translate(54,2) rotate(-270) translate(-54,-2)"/>'
    + '<rect fill="url(#gr2)" x="52" y="25.5" width="4" height="95" transform="translate(54,73) rotate(-270) translate(-54,-73)"/>'
    + '<rect fill="#222" x="13" y="4" width="5" height="4"/>'
    + '<rect fill="#222" x="94" y="4" width="5" height="4"/>'
    + '<rect fill="#222" x="94" y="65" width="5" height="6"/>'
    + '<rect fill="#222" x="13" y="65" width="5" height="6"/>'
    + '</g>'
    + '<g transform="translate(8,7.5)"><rect fill="#2B3036" width="28" height="59" rx="3"/><rect fill="#FFF" x="13.4" y="2" width="1" height="24"/><rect fill="#FFF" x="13.4" y="33" width="1" height="24"/><rect fill="#FFF" x="16.5" y="29.1" width="8" height="1"/><rect fill="#FFF" x="3" y="29.1" width="8" height="1"/></g>'
    + '<g transform="translate(40,7.5)"><rect fill="#2B3036" width="28" height="59" rx="3"/><rect fill="#FFF" x="13.4" y="2" width="1" height="24"/><rect fill="#FFF" x="13.4" y="33" width="1" height="24"/><rect fill="#FFF" x="16.5" y="29.1" width="8" height="1"/><rect fill="#FFF" x="3" y="29.1" width="8" height="1"/></g>'
    + '<g transform="translate(72,7.5)"><rect fill="#2B3036" width="28" height="59" rx="3"/><rect fill="#FFF" x="13.4" y="2" width="1" height="24"/><rect fill="#FFF" x="13.4" y="33" width="1" height="24"/><rect fill="#FFF" x="16.5" y="29.1" width="8" height="1"/><rect fill="#FFF" x="3" y="29.1" width="8" height="1"/></g>'
    + '</g>'
    + '</g>'
    + '</svg>';
  document.body.appendChild(overlay);

  // Immediate show on iframe pages (fast path) — classList.add is idempotent, no flicker
  if (oldWasVisible || location.pathname.includes('/schedule') || location.pathname.includes('/pricing')) {
    overlay.classList.add('visible');
  }

  // --- Overlay logic ---
  var heightDebounce = null;
  var overlayFailsafe = null;

  // If the overlay is shown but ReceiveMyHeight never arrives (e.g. iframe
  // fires a stray load event from internal redirects/posthog/etc), give up
  // after this long and hide it anyway so the user isn't stranded.
  var OVERLAY_FAILSAFE_MS = 5000;

  function showOverlay() {
    overlay.classList.add('visible');
    clearTimeout(overlayFailsafe);
    overlayFailsafe = setTimeout(hideOverlay, OVERLAY_FAILSAFE_MS);
  }

  function hideOverlay() {
    clearTimeout(overlayFailsafe);
    var iframe = document.querySelector('iframe[name="studioyou-iframe"]');
    if (iframe) iframe.style.visibility = 'visible';
    requestAnimationFrame(function () {
      overlay.classList.remove('visible');
    });
  }

  function watchIframe(iframe) {
    showOverlay();
    iframe.addEventListener('load', function () {
      iframe.style.visibility = 'hidden';
      showOverlay();
    });
  }

  var existing = document.querySelector('iframe[name="studioyou-iframe"]');
  if (existing) watchIframe(existing);

  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      for (var j = 0; j < mutations[i].addedNodes.length; j++) {
        var node = mutations[i].addedNodes[j];
        if (node.nodeType !== 1) continue;
        var iframe = node.name === 'studioyou-iframe' ? node
          : node.querySelector && node.querySelector('iframe[name="studioyou-iframe"]');
        if (iframe) watchIframe(iframe);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('message', function (e) {
    try {
      var data = typeof e.data === 'object' ? e.data : JSON.parse(e.data);
      if (data.type === 'ReceiveMyHeight') {
        clearTimeout(heightDebounce);
        heightDebounce = setTimeout(hideOverlay, 300);
      }
    } catch (_) {}
  });

  // --- Dark header on home page at scroll top ---
  // On Framer's mobile breakpoint, the header's *default* styling is already
  // transparent bg + white text (designed to overlay hero video). Removing
  // .bbl-dark-header alone leaves it dark, so we also force a light state via
  // .bbl-light-header that mirrors the desktop cream/black defaults.
  var darkHeaderCSS = document.createElement('style');
  darkHeaderCSS.textContent =
    '.bbl-dark-header{background-color:rgba(0,0,0,0.6)!important;transition:background-color .3s}'
    + '.bbl-dark-header p,.bbl-dark-header a{color:#fff!important}'
    // Logo filters: at viewport <1200, Framer applies filter:invert(1) to a
    // logo-container ancestor (renders the source-black logo as white over
    // dark backdrops). At ≥1200 that filter is dropped. We need to compose
    // against parent state: at desktop the img must do its own inversion;
    // at tablet/mobile it must leave (or counter) the parent's invert.
    + '.bbl-dark-header [data-framer-name="Logo"] img{filter:brightness(0) invert(1)!important}'
    + '.bbl-dark-header [data-border]{background-color:transparent!important;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.6)!important}'
    + '.bbl-dark-header [data-framer-name="Wave"]{background-color:rgba(255,255,255,0.15)!important}'
    + '.bbl-dark-header [data-framer-name="Hamburger"] div:not(:has(*)){background-color:#fff!important}'
    + '.bbl-light-header{background-color:rgb(210,205,194)!important;transition:background-color .3s}'
    + '.bbl-light-header p,.bbl-light-header a{color:rgb(26,26,26)!important}'
    + '.bbl-light-header [data-framer-name="Logo"] img{filter:none!important}'
    + '@media (max-width:1199px){'
    +   '.bbl-dark-header [data-framer-name="Logo"] img{filter:none!important}'
    +   '.bbl-light-header [data-framer-name="Logo"] img{filter:invert(1)!important}'
    + '}'
    + '.bbl-light-header [data-framer-name="Hamburger"] div:not(:has(*)){background-color:rgb(26,26,26)!important}';
  document.head.appendChild(darkHeaderCSS);

  function findHeader() {
    var divs = document.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var s = getComputedStyle(divs[i]);
      if (s.position === 'fixed' && parseInt(s.zIndex) >= 10) {
        var rect = divs[i].getBoundingClientRect();
        if (rect.top <= 10 && rect.height < 200 && rect.width > window.innerWidth * 0.5) return divs[i];
      }
    }
    return null;
  }

  var _pushState = history.pushState;
  history.pushState = function () {
    _pushState.apply(this, arguments);
    window.dispatchEvent(new Event('bbl-nav'));
  };
  var _replaceState = history.replaceState;
  history.replaceState = function () {
    _replaceState.apply(this, arguments);
    window.dispatchEvent(new Event('bbl-nav'));
  };

  function initDarkHeader(header) {
    function updateHeader() {
      var isHome = location.pathname === '/' || location.pathname === '';
      var atTop = isHome && window.scrollY <= 400;
      header.classList.toggle('bbl-dark-header', atTop);
      header.classList.toggle('bbl-light-header', !atTop);
    }
    window.addEventListener('scroll', updateHeader, { passive: true });
    window.addEventListener('popstate', updateHeader);
    window.addEventListener('bbl-nav', updateHeader);
    updateHeader();
  }

  var headerEl = findHeader();
  if (headerEl) {
    initDarkHeader(headerEl);
  } else {
    var headerRetry = setInterval(function () {
      headerEl = findHeader();
      if (headerEl) {
        clearInterval(headerRetry);
        initDarkHeader(headerEl);
      }
    }, 200);
  }

})();
