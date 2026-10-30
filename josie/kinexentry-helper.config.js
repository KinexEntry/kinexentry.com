/* KinexEntry "Josie" help assistant — demo/scripted config.
 * In production set mode:'endpoint' and point endpoint.chatUrl / ttsUrl at your server (see CLAUDE_HANDOFF.md).
 * Asset paths are relative to this file; the demo build inlines them.
 * Seasonal hats: load josie-hat-season.js BEFORE this file. Josie wears a black felt hat from the day after
 * Labor Day through the day before Memorial Day, and a white straw hat Memorial Day through Labor Day
 * (user's local date). Override with JOSIE_HAT below, or set window.JOSIE_HAT_OVERRIDE = 'felt' | 'straw' first. */
var JOSIE_HAT = (typeof window !== 'undefined' && window.JOSIE_HAT_OVERRIDE) || 'auto';   // 'auto' | 'felt' | 'straw'
function josiePoses(set) {   // window.JOSIE_ASSETS (optional) maps a path to a CDN URL or data URI; the demo build uses it
  function r(k) { return (typeof window !== 'undefined' && window.JOSIE_ASSETS && window.JOSIE_ASSETS[k]) || k; }
  function a(f) { return r('poses/' + set + '/' + f); }
  return { avatar: a('avatar_96.png'), video: r('video/josie_talking_' + set + '.mp4'),   // 15s talking clip in this hat
    poses: {
    idle: a('idle.png'), waving: a('waving.png'), talking: a('talking.png'), talkClosed: a('talk_closed.png'),
    thinking: a('thinking.png'), success: a('success.png'), sorry: a('sorry.png') } };
}
window.KINEX_HELPER_CONFIG = {
  brand: { primary: '#0E0D0C', accent: '#C4622B', ink: '#0E0D0C', bg: '#FFFFFF', soft: '#F6F1E7',
           font: "'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif" },
  persona: { name: 'Josie', title: 'Kinex Entry help' },
  hatSeason: JOSIE_HAT,
  launcherLabel: 'Help',
  placeholder: 'Tell Josie what is going on…',
  character: { type: 'sprites',
    set: (typeof resolveJosieHat === 'function') ? resolveJosieHat(JOSIE_HAT) : (JOSIE_HAT === 'straw' ? 'straw' : 'felt'),
    sets: { felt: josiePoses('felt'), straw: josiePoses('straw') } },
  greeting: { text: "Howdy! I'm Josie, your Kinex Entry helper. What can I help you with today?", audio: 'audio/greeting.mp3' },
  quickReplies: ["My payment didn't go through", "I can't sign in", "It says I'm not eligible", "Withdraw / refund", "Where are my results?"],
  mode: 'scripted',
  scripted: [
    { match: ['payment', 'pay', 'card', 'declin', 'charge', 'fee', "didn't go through", 'failed'], pose: 'success', audio: 'audio/payment.mp3',
      chips: ['Was I charged twice?', 'Talk to a person'],
      text: "Payment didn't go through? No worries, let's fix it.\n1. Open your entry and tap to pay the fees again.\n2. Double-check your card number, expiration date and billing zip code.\n3. If your bank declined it, try another card or call your bank. Some banks hold a new charge until you OK it.\nKinex Entry never sees or stores your card. Entry fees are charged by Stripe for the event. Still stuck? Tap **Talk to a person** and we'll get you squared away." },
    { match: ['charged twice', 'double charge', 'charged 2', 'two charges', 'refund my'], pose: 'idle', escalate: true,
      text: "I can't see your payment records, so I don't want to guess. Entry fees go to the event organizer through Stripe, and refunds are theirs to make. Let me hand you to a person who can look it up." },
    { match: ['sign in', 'log in', 'login', 'password', 'forgot', 'locked'], pose: 'success',
      text: "Let's get you back in the saddle.\n1. Use the email you signed up with and check it for typos.\n2. Passwords are at least 8 characters.\n3. Forgot it? Tap **Forgot password** on the sign-in screen and we'll email you a link to set a new one." },
    { match: ['not listed', "can't find", 'cant find', 'find the event', 'event isn', 'missing event', 'no event'], pose: 'idle',
      text: "Events show up once their producer lists them with us and the listing is approved. If you know the producer, point them to Kinex Entry office access so they can list it." },
    { match: ['eligible', 'eligibility', 'not allowed', 'card holder', 'cardholder', 'too young', 'age limit'], pose: 'idle',
      text: "The message tells you which rule tripped: age, an association card, or a card-holders-only event. Cards are checked against your profile, so add your card under **Profile** first. If the event's rules allow an exception, the secretary can enter you from the office." },
    { match: ['withdraw', 'scratch', 'cancel my entry', 'refund', 'doctor', 'vet release'], pose: 'idle',
      text: "You can withdraw from the entry itself in the app. Whether your fee comes back depends on that event's rule, shown on its listing. Many refund with a doctor's or vet's release, and you can attach it to the withdrawal as a photo." },
    { match: ['result', 'payout', 'placing', 'standings', 'score', 'my time'], pose: 'idle',
      text: "Results are under **Results** in the app as soon as the secretary records them. Payouts show once the event closes its books. During an event weekend, the secretary at the event is the fastest answer on a draw, time or payout." },
    { match: ['draw', 'run order', 'when do i run', 'position', 'slack'], pose: 'idle',
      text: "Once the secretary posts the draw, open the event to see where you land in the run order. If you're not seeing it yet, the draw probably hasn't been posted. Check back after books close." },
    { match: ['enter', 'sign up for', 'how do i get in', 'register for'], pose: 'success',
      text: "Easy as pie:\n1. Browse events by association, or open events.\n2. Tap the event and check the details and notes.\n3. Pick what you're entering and pay your fees by card.\nYou'll see who all is entered, and you'll get the draw and results right in the app." },
    { match: ['horse', 'coggins', 'association card', 'accolade', 'profile'], pose: 'idle',
      text: "Your association cards, horses, Coggins and accolades all live under **Profile**. Add them there and they'll be checked automatically when you enter." },
    { match: ['delete', 'close my account', 'remove my account'], pose: 'idle',
      text: "Open **Profile**, scroll to the bottom and tap **Delete my account**, then type your password to confirm. It's permanent. If you have an entry in an event that hasn't happened yet, withdraw first." },
    { match: ['contact', 'phone', 'email', 'call', 'human', 'person', 'support'], pose: 'idle', escalate: true,
      text: "Sure thing. Here's how to reach the Kinex Entry team." }
  ],
  fallback: { pose: 'sorry', chips: ['Talk to a person'],
    text: "Shoot, I'm not sure about that one, and I'd rather not guess. Could you say it another way? Or tap **Talk to a person** and the team will help." },
  escalation: { label: 'Talk to a person',
    text: "Email [info@kinexentry.com](mailto:info@kinexentry.com) or call [(479) 510-4138](tel:+14795104138). Tell them which event you're asking about and they'll be quicker. During an event weekend, the secretary at the event holds the books." },
  endpoint: { chatUrl: '/api/help/chat', ttsUrl: '/api/help/tts' }
};
