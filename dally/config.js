/*
 * Dally, the help hand on kinexentry.com.
 *
 * The engine is helper-widget.js (sprite poses, the panel, the chat). This
 * is everything about Kinex Entry: the look, the words, and where the answers
 * come from — the API's /v1/help/chat, which answers from Dally's knowledge
 * list and, when the server has a model key, with the model behind it. The
 * entry chat lives in the bottom-right corner, so Dally sits bottom-left.
 * There is no voice yet, so the panel starts muted and hides the speaker.
 */
(function () {
  var API = /^(localhost|127.0.0.1)$/.test(location.hostname) ? "http://localhost:8787" : "https://api.kinexentry.com";
  var here = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^\/]*$/, "") : "dally/";
  window.KINEX_HELPER_CONFIG = {
    brand: { primary: "#1b1917", accent: "#C4622B", ink: "#0E0D0C", bg: "#FFFFFF", soft: "#F6F1E7", font: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
    persona: { name: "Dally", title: "Kinex Entry help", avatar: here + "poses/avatar_96.png" },
    launcherLabel: "Help",
    placeholder: "Tell Dally what is going on…",
    position: "left",
    startMuted: true,
    character: { type: "sprites", poses: {
      idle: here + "poses/idle.png", waving: here + "poses/waving.png", talking: here + "poses/talking.png", talkClosed: here + "poses/talk_closed.png",
      thinking: here + "poses/thinking.png", success: here + "poses/success.png", sorry: here + "poses/sorry.png" } },
    greeting: { text: "Howdy! I'm Dally, your Kinex Entry helper. What can I help you with today?" },
    quickReplies: ["My payment didn't go through", "I can't sign in", "It says I'm not eligible", "How do I draw out?", "Where are my results?"],
    mode: "endpoint",
    endpoint: { chatUrl: API + "/v1/help/chat", credentials: "omit" },
    errorText: "Shoot, I can't reach the office right now. Try again in a moment, or email info@kinexentry.com.",
    escalation: { label: "Talk to a person",
      text: "Email [info@kinexentry.com](mailto:info@kinexentry.com) or call [(479) 510-4138](tel:+14795104138). Say which event you are asking about and they will be quicker. During an event weekend, the secretary at the event holds the books." },
    getContext: function () { return { screen: location.pathname.replace(/^\//, "") || "home", app: "web" }; },
  };
  function start() {
    if (!window.HelperWidget || !window.KINEX_HELPER_CONFIG) return;
    window.KINEX_DALLY = window.HelperWidget.mount(window.KINEX_HELPER_CONFIG);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
