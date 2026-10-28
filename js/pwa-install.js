// Install button: shown only when the app can actually be installed and isn't already.
// Chrome/Edge/Android hand us a prompt; iOS Safari has none, so we explain Add to Home Screen.

const btn = document.getElementById("btn-install");

const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let deferredPrompt = null;

function showIOSHelp() {
  const body = document.getElementById("howto-modal-body");
  if (!body) return;
  body.innerHTML = `
    <div class="modal-header-block">
      <span class="guide-kicker">install</span>
      <h2 style="margin-top:6px;">Add Focal to your home screen</h2>
      <p class="guide-sub">"Keep the lighthouse one tap away."</p>
    </div>
    <div class="howto-steps">
      <div class="howto-step-card">
        <div class="howto-step-icon">01</div>
        <div class="howto-step-text">
          <h4>Open the share menu</h4>
          <p>Tap the Share button in Safari's toolbar.</p>
        </div>
      </div>
      <div class="howto-step-card">
        <div class="howto-step-icon">02</div>
        <div class="howto-step-text">
          <h4>Add to Home Screen</h4>
          <p>Scroll down, choose "Add to Home Screen", then tap Add.</p>
        </div>
      </div>
    </div>
  `;
  document.getElementById("howto-modal")?.classList.remove("hidden");
}

if (btn && !isStandalone) {
  if (isIOS) btn.hidden = false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    btn.hidden = true;
  });

  btn.addEventListener("click", async () => {
    if (deferredPrompt) {
      // A prompt can only be used once; if it's dismissed, the button returns
      // when the browser fires beforeinstallprompt again.
      const prompt = deferredPrompt;
      deferredPrompt = null;
      btn.hidden = true;
      prompt.prompt();
      await prompt.userChoice;
    } else if (isIOS) {
      showIOSHelp();
    }
  });
}
