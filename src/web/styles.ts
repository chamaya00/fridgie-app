// The one stylesheet, inlined into every page (no request, no new host). Tokens,
// type, spacing, motion and focus are the design spec's section 9; the rules
// follow the mock, docs/design/6-inventory-and-tools.html.

export const STYLES = `
:root {
  color-scheme: light dark;
  --ground: #F5F2EA; --surface: #FCFAF5; --chip: #EAE5D8;
  --ink: #1E1C17; --muted: #5F5A4E;
  --accent: #1E5B47; --on-accent: #FFFFFF;
  --low: #94560A; --out: #B42318; --untracked: #6B665A;
  --error-bg: #FBE9E6; --error-ink: #8A1C12;
  --flash-bg: #E3EEE8;
  --gh: #1E1C17; --on-gh: #FFFFFF;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #15140F; --surface: #1F1D17; --chip: #2C2921;
    --ink: #EFEBE1; --muted: #A9A394;
    --accent: #86CDB3; --on-accent: #10241D;
    --low: #E6A54E; --out: #FF8C7F; --untracked: #9C9686;
    --error-bg: #3A1A16; --error-ink: #FFB4A9;
    --flash-bg: #1E3229;
    --gh: #EFEBE1; --on-gh: #15140F;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--ground); color: var(--ink); }
body {
  font: 16px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
form { margin: 0; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.bar { display: flex; align-items: center; gap: 16px; padding: 10px 16px; max-width: 1040px; margin: 0 auto; }
.mark { font-weight: 750; font-size: 17px; letter-spacing: -0.01em; color: var(--ink); text-decoration: none; }
.bar nav { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.bar nav a.link { color: var(--muted); text-decoration: none; font-size: 15px; padding: 8px 10px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 40px; padding: 0 16px; border: 0; border-radius: 20px;
  font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none;
  background: var(--chip); color: var(--ink); white-space: nowrap;
}
.btn.primary { background: var(--accent); color: var(--on-accent); }
.btn.big { height: 52px; border-radius: 26px; padding: 0 24px; font-size: 17px; }
.btn.gh { background: var(--gh); color: var(--on-gh); }
.btn.quiet { background: transparent; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.btn.danger { background: transparent; color: var(--out); box-shadow: inset 0 0 0 2px var(--out); }
.btn.danger-fill { background: var(--out); color: var(--surface); }
.btn:focus-visible, a:focus-visible, input:focus-visible, .segs:focus-within {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

.wrap { max-width: 1040px; margin: 0 auto; padding: 0 16px 48px; }
.narrow-wrap { max-width: 520px; margin: 0 auto; padding: 0 16px 48px; }

.summary { margin: 14px 0 20px; font-size: 25px; line-height: 1.15; font-weight: 700; letter-spacing: -0.025em; max-width: 22ch; }
.summary .w-low { color: var(--low); }
.summary .w-out { color: var(--out); }
.summary small { display: block; margin-top: 6px; font-size: 14px; font-weight: 400; letter-spacing: 0; color: var(--muted); }

.groups { display: grid; gap: 18px; }
.group h2 {
  margin: 0 0 6px 2px; font-size: 13px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--muted); display: flex; gap: 8px;
}
.group h2 span { font-weight: 500; letter-spacing: 0.02em; }
.list { background: var(--surface); border-radius: 18px; overflow: hidden; }
.row {
  display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; column-gap: 10px; row-gap: 8px;
  padding: 11px 14px 11px 12px; align-items: start; scroll-margin-top: 12px;
}
.row + .row { border-top: 2px solid var(--ground); }
.mk { display: block; width: 14px; height: 14px; border-radius: 50%; margin-top: 4px; }
.mk-out { background: var(--out); }
.mk-low { box-shadow: inset 0 0 0 2px var(--low); background: linear-gradient(to top, var(--low) 45%, transparent 45%); }
.mk-untracked { border: 2px dashed var(--untracked); }
.name { font-size: 17px; font-weight: 600; color: var(--ink); text-decoration: none; display: block; line-height: 22px; overflow-wrap: anywhere; }
.why { display: block; font-size: 13.5px; line-height: 18px; color: var(--muted); margin-top: 1px; }
.why b { font-weight: 700; }
.t-low { color: var(--low); }
.t-out { color: var(--out); }
.t-untracked { color: var(--untracked); }
.qty { text-align: right; line-height: 1; padding-top: 1px; }
.qty .n { font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.qty .u { display: block; font-size: 12px; color: var(--muted); margin-top: 3px; }
.qty.stale .n { color: var(--muted); font-weight: 500; }
.qty.zero .n { color: var(--out); }
.acts { grid-column: 2 / 4; display: flex; flex-wrap: wrap; gap: 8px; }
.acts .btn { height: 36px; min-width: 64px; padding: 0 14px; font-size: 14.5px; }
.row.fresh { background: var(--flash-bg); animation: fade 1200ms ease-out 400ms forwards; }
@keyframes fade { to { background: var(--surface); } }

.flash {
  display: flex; gap: 12px; align-items: center; margin: 10px 0 0; padding: 12px 14px; border-radius: 14px;
  background: var(--flash-bg); color: var(--ink); font-size: 15px;
  animation: enter 180ms cubic-bezier(.2,.7,.3,1);
}
@keyframes enter { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
.flash a { margin-left: auto; color: var(--ink); font-weight: 600; white-space: nowrap; }
.alert { padding: 14px; border-radius: 14px; background: var(--error-bg); color: var(--error-ink); font-size: 15px; margin: 10px 0 18px; }
.alert b { display: block; font-size: 16px; margin-bottom: 2px; }
@media (prefers-reduced-motion: reduce) {
  .flash, .row.fresh { animation: none; }
}

.back { display: inline-block; color: var(--muted); text-decoration: none; font-size: 15px; padding: 10px 0; }
h1.page { margin: 6px 0 4px; font-size: 32px; line-height: 1.1; font-weight: 750; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.lede { color: var(--muted); margin: 0 0 20px; font-size: 15px; }
.lede a { color: var(--ink); font-weight: 600; }
.field { margin: 0 0 16px; }
.field > label, .field > .lbl { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.hint { font-size: 13px; color: var(--muted); margin-top: 5px; }
.hint.bad { color: var(--out); }
.opt { font-weight: 400; color: var(--muted); }
input.in {
  width: 100%; height: 48px; border: 0; border-radius: 12px; padding: 0 14px;
  background: var(--surface); color: var(--ink); font: inherit; font-size: 17px;
  box-shadow: inset 0 0 0 2px var(--chip);
}
input.in.bad { box-shadow: inset 0 0 0 2px var(--out); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.money { position: relative; }
.money span { position: absolute; left: 14px; top: 13px; color: var(--muted); font-size: 17px; }
.money input { padding-left: 28px; }
.segs { display: grid; grid-template-columns: 1fr 1fr; background: var(--chip); border-radius: 14px; padding: 4px; border: 0; margin: 0; }
.segs label { position: relative; display: flex; align-items: center; justify-content: center; height: 44px; border-radius: 10px; font-weight: 600; font-size: 16px; color: var(--muted); cursor: pointer; }
.segs input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.segs label:has(input:checked) { background: var(--surface); color: var(--ink); }
.stepper { display: grid; grid-template-columns: 56px 1fr 56px; gap: 10px; align-items: center; }
.stepper .btn { height: 56px; border-radius: 16px; font-size: 26px; padding: 0; }
.stepper input { text-align: center; font-size: 28px; font-weight: 650; height: 56px; font-variant-numeric: tabular-nums; }
.formacts { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 22px; }
.card { background: var(--surface); border-radius: 18px; padding: 16px; margin: 0 0 16px; scroll-margin-top: 12px; }
.card h2 { margin: 0 0 4px; font-size: 16px; }
.card p { margin: 0 0 12px; color: var(--muted); font-size: 14.5px; }
.card .two .btn { height: 48px; }
.hist { list-style: none; margin: 0; padding: 0; font-size: 14.5px; }
.hist li { display: flex; gap: 10px; padding: 8px 0; color: var(--ink); }
.hist li + li { border-top: 2px solid var(--ground); }
.hist .d { color: var(--muted); min-width: 56px; }
.hist .p { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
.state-line { display: flex; align-items: flex-start; gap: 8px; font-size: 15px; margin: 0 0 18px; }
.state-line .mk { margin-top: 3px; flex: none; }
.footer-links { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; margin-top: 22px; }

.hero { max-width: 520px; margin: 0 auto; padding: 18vh 24px 48px; }
.hero .mark { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.hero h1 { font-size: 46px; line-height: 1.02; letter-spacing: -0.04em; margin: 14px 0; font-weight: 780; }
.hero p { color: var(--muted); font-size: 16px; margin: 0 0 28px; max-width: 34ch; }
.hero p b { color: var(--ink); }
.fine, .hero .fine { font-size: 13.5px; color: var(--muted); margin: 18px 0 0; }

.eyebrow { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
.card h3 { margin: 0 0 4px; font-size: 16px; }
.fine b { color: var(--ink); }
.perm { list-style: none; padding: 0; margin: 0 0 8px; }
.perm li { padding: 12px 0; display: grid; grid-template-columns: 22px 1fr; gap: 10px; }
.perm li + li { border-top: 2px solid var(--ground); }
.perm .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ink); margin-top: 7px; }
.host { overflow-wrap: anywhere; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 15px; background: var(--chip); padding: 2px 6px; border-radius: 6px; color: var(--ink); }
.asst { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; }
.asst .nm { font-size: 18px; font-weight: 650; }
.asst .meta { grid-column: 1; color: var(--muted); font-size: 14px; }
.asst .btn { grid-row: 1 / 3; grid-column: 2; }
.empty-box { background: var(--surface); border-radius: 18px; padding: 20px 16px; }
.empty-box h3 { margin: 0 0 6px; font-size: 18px; }
.empty-box p { margin: 0 0 10px; color: var(--muted); font-size: 15px; }
.empty-box ol { margin: 0; padding-left: 20px; color: var(--ink); font-size: 15px; }
.empty-box ol li { margin: 4px 0; }

.empty-list { background: var(--surface); border-radius: 18px; padding: 18px 16px; color: var(--muted); font-size: 15px; }
.empty-list strong { color: var(--ink); display: block; margin-bottom: 4px; font-size: 16px; }
.empty-list a { color: var(--ink); }

@media (min-width: 760px) {
  .bar { padding: 18px 32px; }
  .wrap { padding: 0 32px 64px; }
  .summary { font-size: 52px; margin: 28px 0 36px; max-width: 18ch; letter-spacing: -0.035em; }
  .summary small { font-size: 16px; margin-top: 14px; }
  .groups { grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
  .acts .btn { height: 38px; }
  h1.page { font-size: 40px; }
  .narrow-wrap { padding-top: 24px; }
  .hero h1 { font-size: 64px; }
}
`;
