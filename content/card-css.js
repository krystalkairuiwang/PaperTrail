// Styles for the on-page card/toast. Injected as a constructable stylesheet into a closed-off
// shadow root so host-page CSS can't leak in and page CSP can't block it.
window.__PT_CSS = `
:host { all: initial; }
.pt { font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1B2230; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.pt * { box-sizing: border-box; }
button { font: inherit; cursor: pointer; }
.logo { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; background: #1B2230; color: #FBF8F1; font: 700 11px/1 "Iowan Old Style", Palatino, Georgia, serif; margin-right: 6px; }

.card { width: 300px; background: #FBF8F1; border: 1px solid #E2D9C6; border-radius: 12px; box-shadow: 0 1px 0 #fff inset, 0 12px 32px -12px rgba(27,34,48,.35), 0 2px 6px rgba(27,34,48,.08); overflow: hidden; animation: up .28s cubic-bezier(.2,.8,.2,1); }
.head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; border-bottom: 1px dashed #E2D9C6; }
.brand { display: flex; align-items: center; font: 600 12.5px/1 "Iowan Old Style", Palatino, Georgia, serif; letter-spacing: .01em; }
.src { margin-left: auto; font: 500 10.5px/1 ui-monospace, "SF Mono", Menlo, monospace; color: #6B6457; background: #F1EBDD; padding: 4px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: .04em; }
.x { border: 0; background: transparent; color: #6B6457; width: 22px; height: 22px; border-radius: 6px; font-size: 16px; line-height: 1; }
.x:hover { background: #F1EBDD; color: #1B2230; }
.body { padding: 11px 12px 12px; }
.eyebrow { font: 600 10px/1 ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: .08em; color: #C2410C; margin-bottom: 6px; }
.title { font: 600 15px/1.25 "Iowan Old Style", Palatino, Georgia, serif; color: #1B2230; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { color: #4A4438; margin-top: 3px; font-size: 12px; }
.small { color: #6B6457; font-size: 11.5px; margin-top: 8px; }
.actions { display: flex; gap: 6px; margin-top: 11px; }
.actions button { flex: 1; border-radius: 8px; padding: 8px 10px; font-weight: 600; font-size: 12.5px; transition: transform .08s, background .15s; }
.actions button:active { transform: translateY(1px); }
.primary { background: #1B2230; color: #FBF8F1; border: 1px solid #1B2230; }
.primary:hover { background: #2A3346; }
.ghost { background: transparent; color: #1B2230; border: 1px solid #D5CBB5; }
.ghost:hover { background: #F1EBDD; }
button:disabled { opacity: .6; cursor: progress; }
.tracked { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.tracked .small { margin-top: 0; }

.stamp { display: inline-block; font: 700 10.5px/1 ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: .1em; padding: 5px 7px 4px; border: 1.5px solid currentColor; border-radius: 4px; transform: rotate(-2deg); }
.s-saved { color: #6B6457; } .s-applied { color: #C2410C; } .s-interview { color: #2B4C7E; } .s-offer { color: #2F6B4F; } .s-rejected { color: #8A8172; text-decoration: line-through; }

.tab { position: relative; width: 40px; height: 40px; border-radius: 12px; border: 1px solid #E2D9C6; background: #FBF8F1; box-shadow: 0 8px 20px -8px rgba(27,34,48,.4); display: grid; place-items: center; }
.tab .logo { width: 24px; height: 24px; font-size: 14px; margin: 0; border-radius: 7px; }
.tab .dot { position: absolute; top: -3px; right: -3px; width: 11px; height: 11px; border-radius: 50%; background: #C2410C; border: 2px solid #FBF8F1; }

.toast { position: relative; width: 300px; background: #1B2230; color: #FBF8F1; border-radius: 12px; padding: 13px 14px 12px; box-shadow: 0 16px 40px -12px rgba(0,0,0,.45); animation: up .3s cubic-bezier(.2,.8,.2,1); overflow: hidden; }
.toast.out { animation: down .5s ease forwards; }
.t-head { font: 600 10.5px/1.35 ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: .08em; color: #F3B48C; }
.t-body { margin-top: 7px; font: 500 14px/1.3 "Iowan Old Style", Palatino, Georgia, serif; }
.t-body b { font-weight: 700; }
.t-sub { margin-top: 5px; font-size: 11.5px; color: #B9B3A6; }
.t-actions { display: flex; gap: 6px; margin-top: 10px; }
.t-actions button { background: rgba(251,248,241,.08); color: #FBF8F1; border: 1px solid rgba(251,248,241,.18); border-radius: 7px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
.t-actions button:hover { background: rgba(251,248,241,.16); }
.bigstamp { position: absolute; right: 16px; bottom: 16px; font: 800 13px/1 ui-monospace, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; color: #F07A3A; border: 2px solid #F07A3A; border-radius: 5px; padding: 6px 7px 5px; transform: rotate(-9deg); animation: stamp .45s cubic-bezier(.3,1.6,.5,1) .1s both; opacity: .95; }


.t-why { margin-top: 9px; font-size: 11.5px; color: #D9D3C6; }
.t-why summary { cursor: pointer; color: #F3B48C; font: 600 10.5px/1.4 ui-monospace, Menlo, monospace; text-transform: uppercase; letter-spacing: .06em; list-style: none; }
.t-why summary::-webkit-details-marker { display: none; }
.t-why summary::before { content: '▸ '; }
.t-why[open] summary::before { content: '▾ '; }
.t-why ul { margin: 6px 0 0; padding: 0 0 0 14px; }
.t-why li { margin: 3px 0; line-height: 1.35; }
.t-why[open] ~ .t-actions, .t-why[open] { padding-right: 0; }

.prompt { width: 300px; background: #FBF8F1; border: 1.5px solid #C2410C; border-radius: 12px; padding: 12px 13px 13px; box-shadow: 0 16px 40px -14px rgba(194,65,12,.45), 0 2px 6px rgba(27,34,48,.08); animation: up .3s cubic-bezier(.2,.8,.2,1); }
.p-head { display: flex; align-items: center; font: 600 15px/1.2 "Iowan Old Style", Palatino, Georgia, serif; color: #1B2230; }
.p-body { margin-top: 8px; font-size: 13px; color: #1B2230; }
.p-sub { margin-top: 5px; font-size: 11.5px; color: #6B6457; }
.prompt .actions { margin-top: 11px; }

@keyframes up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes down { to { opacity: 0; transform: translateY(10px); } }
@keyframes stamp { from { opacity: 0; transform: rotate(-9deg) scale(2.2); } to { opacity: .95; transform: rotate(-9deg) scale(1); } }
@media (prefers-reduced-motion: reduce) { .card, .toast, .bigstamp { animation: none !important; } }
`;
