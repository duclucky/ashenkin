export const CHIMERA_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Courier+Prime:wght@400;700&family=Press+Start+2P&family=Space+Grotesk:wght@500;600;700&display=swap');

.chm-lantern-door-open{animation:chm-lantern-door-open 320ms steps(5,end) both}
@keyframes chm-lantern-door-open{from{transform:translateX(0) scaleX(1)}to{transform:translateX(3px) scaleX(.4)}}

.chm-root{
  /* Zama Brand Kit: https://www.zama.org/zama-brand-kit */
  --chm-black:#000000; --chm-charcoal:#2D2D2D; --chm-gray:#F4F4F4; --chm-white:#FFFFFF;
  --chm-yellow:#FFD209; --chm-yellow-hover:#f2c500; --chm-yellow-soft:#fff5be; --chm-brand-ink:#000000;
  --chm-bg:#F4F4F4; --chm-panel:#FFFFFF; --chm-panel2:#F4F4F4; --chm-line:#D4D4D4;
  --chm-ink:#000000; --chm-dim:#606060; --chm-teal:#2D2D2D; --chm-teal-d:#000000;
  --chm-gold:var(--chm-yellow); --chm-ember:#bc7955; --chm-red:#972e26;
  --chm-orange:#FF7020; --chm-blue:#2B50F5; --chm-pink:#FF8FC7; --chm-mint:#3DDC97;
  --chm-sh:0 3px 10px #171c2420;
  font-family:Inter,ui-sans-serif,system-ui,sans-serif; color:var(--chm-ink);
  background:var(--chm-bg);
  min-height:100vh;
}
.chm-root ::selection{background:var(--chm-yellow);color:#111}
.chm-root :where(a,button,summary,input,select,textarea,[tabindex="0"]):focus-visible{outline:3px solid var(--chm-black);outline-offset:3px}
.chm-root [tabindex="-1"]{scroll-margin-top:5.5rem}
.chm-skip{position:fixed;z-index:100;top:8px;left:8px;transform:translateY(-150%);background:var(--chm-yellow);color:#111;border:3px solid #111;padding:10px 14px;font-weight:800}
.chm-skip:focus{transform:translateY(0)}
.chm-menu .chm-nav a{min-height:44px;align-content:center;border-color:#D4D4D4}
.chm-menu .chm-nav a.on{border-color:#111}
.chm-hud{background:#171717;border-bottom:1px solid #494942;box-shadow:0 4px 18px #10171a35}
.chm-hud-row{display:flex;align-items:center;gap:clamp(8px,1.5cqw,20px);min-height:64px;max-width:80rem;margin:auto;padding:0 12px}
.chm-hud-brand{display:inline-flex;align-items:center;min-height:44px;flex:none;gap:5px;color:#F4F4F4;line-height:1;font-size:clamp(15px,2cqw,22px)}
.chm-hud-brand svg{flex:none}
.chm-hud .chm-hud-row .chm-nav a{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:#e7eadf;white-space:nowrap}
.chm-hud .chm-hud-row .chm-nav a:hover{background:#2b3542;color:#fff;border-color:#667057}
.chm-hud .chm-hud-row .chm-nav a.on{background:var(--chm-yellow);color:var(--chm-brand-ink);border:1px solid var(--chm-yellow);box-shadow:none}
.chm-hud-tools{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.chm-hud-control,.chm-hud .chm-hud-connect{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;padding:0 8px;border:2px solid #606060;background:#2D2D2D;color:#FFFFFF;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:none}
.chm-hud-control:hover,.chm-hud-control[aria-expanded="true"]{background:#2D2D2D;border-color:#9b9c72}
.chm-hud .chm-hud-connect,.chm-hud-inbox[data-pending]{background:var(--chm-yellow);color:var(--chm-brand-ink);border-color:var(--chm-yellow)}
.chm-hud-account span{font-family:'Courier Prime',monospace}
.chm-hud-account[aria-expanded="true"] svg:last-child{transform:rotate(180deg)}
.chm-hud-inbox{padding:0}
.chm-hud-count{position:absolute;top:2px;right:2px;min-width:14px;line-height:14px;padding:0 2px;background:#743326;color:white;font:700 11px/14px 'Courier Prime',monospace}
.chm-hud-wallet{position:relative}
.chm-wallet-panel{position:absolute;z-index:1;top:calc(100% + 8px);right:0;width:min(17rem,calc(100cqw - 66px));border:2px solid #606060;background:#FFFFFF;color:#606060;box-shadow:4px 4px #141b22}
.chm-wallet-summary{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 10px;padding:12px;background:#F4F4F4;border-bottom:1px solid #606060}
.chm-wallet-summary p{font:700 13px 'Courier Prime',monospace}
.chm-wallet-actions{padding:4px 0}
.chm-wallet-panel .chm-wallet-action{display:flex;align-items:center;justify-content:flex-start;gap:9px;width:100%;min-height:44px;padding:5px 12px;border:0;background:transparent;color:inherit;box-shadow:none;font-size:13px;font-weight:700;text-align:left}
.chm-wallet-panel .chm-wallet-action:hover:not(:disabled){background:#F4F4F4;box-shadow:none;transform:none}
.chm-wallet-panel .chm-wallet-disconnect{border-top:1px solid #D4D4D4;color:#772c25}
.chm-hud :is(a,button):focus-visible{outline-color:#fae29c;outline-offset:1px}
.chm-wallet-panel :is(a,button):focus-visible,.chm-menu :is(a,button):focus-visible{outline:2px solid var(--chm-black);outline-offset:-3px}
@container chimera (max-width:360px){.chm-hud-row{padding-inline:8px}.chm-hud-tools{gap:4px}.chm-hud-account span,.chm-hud-account svg:last-child{display:none}}
.chm-menu .chm-nav a > span{vertical-align:middle;margin-right:2px}
.chm-location{position:relative;isolation:isolate;display:flex;align-items:end;min-height:clamp(158px,19cqw,236px);overflow:hidden;border:1px solid #2D2D2D;border-bottom:2px solid var(--chm-yellow);background:#000000;color:#fff;box-shadow:0 8px 22px #18272220}
.chm-location-art{position:absolute;inset:0;overflow:hidden;z-index:-2}
.chm-location-art::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#101b1f 2%,#101b1fea 29%,#101b1f35 72%,#101b1f10),linear-gradient(0deg,#101b1f99,transparent 48%);pointer-events:none}
.chm-location-building{position:absolute;right:8%;bottom:10%;width:clamp(95px,25cqw,240px);height:80%;overflow:visible;filter:saturate(.76) drop-shadow(0 9px 10px #07131780)}
.chm-location-item{position:absolute;right:34%;bottom:10%;width:clamp(28px,6.5cqw,70px);filter:drop-shadow(0 5px 5px #07131790)}
.chm-location-copy{min-width:0;padding:clamp(16px,3cqw,36px);width:100%}
.chm-location h1{font-size:clamp(30px,4.1cqw,58px);max-width:78%;line-height:1.02;color:#FFFFFF;text-wrap:balance}
.chm-location.chm-location-file{min-height:104px}
.chm-location-file .chm-location-copy{padding:18px 24px}
.chm-location-file h1{font-size:clamp(25px,3cqw,36px)}
.chm-location-file .chm-location-building{right:7%;width:85px;filter:saturate(.7);opacity:.65}
.chm-location-file .chm-location-status{margin-top:5px}
.chm-location-status,.chm-location-actions{display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:10px;max-width:60ch;align-items:center}
.chm-location-status{font-size:14px;color:#FFFFFF}
.chm-location-status strong{color:white}
.chm-location-actions a:not(.chm-btn){display:inline-flex;min-height:44px;align-items:center;color:#fff;text-decoration:underline;text-underline-offset:4px;font-weight:700}
@container chimera (max-width:639px){.chm-location-art::after{background:linear-gradient(90deg,#0e1427f5,#0e1427a0 52%,#0e142736),linear-gradient(0deg,#0e1427a6,transparent 70%)}.chm-location-building{right:3%;height:75%}.chm-location-item{right:30%}.chm-location-status{font-size:13px}}
.chm-playfield{background:var(--chm-white);background-attachment:local}
.chm-playfield:has(.chm-overworld){background:var(--chm-white)}
.chm-overworld{display:grid;grid-template-areas:'title title' 'board guide' 'board journal';grid-template-columns:minmax(0,1fr) minmax(225px,265px);grid-template-rows:auto auto 1fr;align-items:start;gap:14px 20px;color:#FFFFFF}
.chm-world-title{grid-area:title;display:flex;min-height:35px;align-items:center;justify-content:space-between;gap:12px}
.chm-world-title h1{color:var(--chm-black);font-size:clamp(27px,3.6cqw,44px);line-height:1.12}
.chm-map-motion{margin-left:auto;min-height:44px;padding:4px 8px;border:1px solid #606060;background:#606060;color:#FFFFFF;font-size:12px;font-weight:700;white-space:nowrap}
.chm-map-motion[aria-pressed="true"]{background:var(--chm-yellow);color:var(--chm-brand-ink);border-color:var(--chm-yellow)}
.chm-world-resources{display:flex;gap:12px;border:2px solid #606060;background:#606060;padding:5px 8px;font:700 13px 'Courier Prime',monospace}
.chm-world-resources span{display:flex;align-items:center;gap:4px}
.chm-world-board{grid-area:board;min-width:0;border:1px solid #606060;box-shadow:0 14px 34px #10161870;background:#000000}
.chm-world-map{position:relative;width:100%;overflow:hidden;isolation:isolate;user-select:none;image-rendering:pixelated}
.chm-world-map:focus-visible{outline-offset:-4px}
.chm-world-map [data-place]:focus-visible{outline:3px solid #fff0ab;outline-offset:-2px}
.chm-m-plate{background:#2D2D2Ded;border:1px solid #697868;color:#FFFFFF;box-shadow:0 2px 4px #16232275;min-width:100%;letter-spacing:.05em}
.chm-m-bld[data-active] .chm-m-plate,.chm-m-bld:focus-visible .chm-m-plate{background:var(--chm-yellow);color:var(--chm-brand-ink);border-color:var(--chm-yellow)}
.chm-world-lumen{position:absolute;z-index:20;min-height:32px;background:none;border:0;padding:0}
.chm-world-offline{position:absolute;inset:auto 0 0;z-index:40;text-align:center;background:#f4d886;color:#181f19;padding:4px}
.chm-world-status{display:flex;justify-content:space-between;align-items:center;gap:6px 16px;min-height:64px;border-top:1px solid #606060;padding:8px 14px;font-size:13px}
.chm-world-status strong{color:var(--chm-yellow);font:700 13px 'Courier Prime',monospace}
.chm-world-status p{line-height:1.35}
.chm-world-controls{color:#BDBDBD;font:700 12px 'Courier Prime',monospace;text-align:right}
.chm-world-guide{grid-area:guide;min-width:0}
.chm-briefing,.chm-guide-toggle{background:#FFFFFF;color:#606060;border:1px solid #606060;box-shadow:0 6px 18px #10191833;padding:14px}
.chm-guide-toggle{display:flex;width:100%;min-height:44px;align-items:center;gap:8px;text-align:left;font-weight:800}
.chm-briefing-head{display:flex;align-items:center;gap:8px}
.chm-lumen-portrait{display:grid;place-items:center;flex:none;width:46px;height:50px;border:1px solid #606060;background:#F4F4F4;padding:7px}
.chm-briefing-head p{font:700 12px 'Courier Prime',monospace;color:#606060}
.chm-briefing-head h2{font-size:clamp(15px,1.6cqw,19px);line-height:1.15;margin-top:3px}
.chm-briefing .chm-btn-primary{background:var(--chm-yellow)}
.chm-guest{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px}
.chm-guest-copy{min-width:150px;flex:1;font-size:14px;font-weight:700}
.chm-guest-copy span{display:block;color:#606060;font:700 12px 'Courier Prime',monospace;margin-bottom:3px}
.chm-guest-actions{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px}
.chm-mode{display:flex;align-items:center;gap:8px;min-height:44px;background:var(--chm-panel2);color:var(--chm-ink);border:1px solid var(--chm-line);padding:6px 12px;font-size:13px;font-weight:700}
.chm-mode[aria-pressed="true"]{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-black);box-shadow:inset 0 -2px var(--chm-black)}
.chm-ring-title{color:var(--chm-black);font-size:clamp(15px,2cqw,22px);line-height:1.5}
.chm-lab-key{border:2px solid #606060;background:#F4F4F4;color:#606060}
.chm-lab-key summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;padding:6px 12px;font-size:14px;font-weight:800;list-style:none}
.chm-lab-key summary::-webkit-details-marker{display:none}
.chm-lab-key[open] summary svg:last-child{transform:rotate(180deg)}
.chm-training-notes{border-top:1px solid var(--chm-line)}
.chm-training-notes summary{min-height:44px;align-content:center;cursor:pointer;font-size:13px;font-weight:600;color:var(--chm-dim)}
.chm-world-journal{grid-area:journal;display:grid;gap:8px;min-width:0}
.chm-world-disclosure{border:2px solid #606060;background:#000000;color:#FFFFFF}
.chm-world-disclosure summary,.chm-world-directory summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;cursor:pointer;padding:6px 12px;font-weight:700;font-size:13px;list-style:none}
.chm-world-disclosure summary::-webkit-details-marker,.chm-world-directory summary::-webkit-details-marker{display:none}
.chm-world-disclosure[open] summary svg,.chm-world-directory[open] summary svg{transform:rotate(180deg)}
.chm-world-disclosure li button{width:100%;min-height:44px;padding:6px 12px;border-top:1px solid #606060;text-align:left;font-size:13px}
.chm-world-disclosure p{padding:6px 12px;font-size:13px}
.chm-world-judge{min-height:44px;border:2px solid #606060!important;box-shadow:none!important}
.chm-world-judge[aria-pressed="false"]{background:#F4F4F4;color:#606060}
.chm-world-judge span span{display:none}
.chm-world-directory{display:none;border-top:1px solid #606060}
.chm-world-directory ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 8px 8px}
.chm-world-directory button{display:flex;align-items:center;gap:6px;min-height:44px;width:100%;background:#F4F4F4;border:2px solid #263429;color:#606060;padding:5px;text-align:left;font:700 12px 'Courier Prime',monospace}
.chm-world-directory svg{width:27px;height:26px;flex:none}
@container chimera (max-width:859px){.chm-overworld{grid-template-areas:'title' 'guide' 'board' 'journal';grid-template-columns:minmax(0,1fr);grid-template-rows:auto;gap:12px}.chm-world-directory{display:block}.chm-world-controls{display:none}.chm-briefing{padding:10px}.chm-world-status{min-height:52px}}
@container chimera (max-width:450px){.chm-world-map .chm-m-plate{visibility:hidden}.chm-world-map .chm-m-bld[data-active] .chm-m-plate,.chm-world-map .chm-m-bld:focus-visible .chm-m-plate{visibility:visible}}
@container chimera (max-width:639px){.chm-location-art::after{background:linear-gradient(90deg,#132420f5,#132420a0 52%,#13242036),linear-gradient(0deg,#132420a6,transparent 70%)}}
.chm-practice-ring{background:linear-gradient(180deg,#c0d5ff 68%,#d9ad6e 68%,#edc887 75%)}
.chm-practice-stage{position:relative;isolation:isolate;overflow:hidden;aspect-ratio:16/9;min-height:166px;border:1px solid #606060;background:#273541;color:white;box-shadow:var(--chm-sh)}
.chm-action-pad{position:absolute;left:27%;right:24%;bottom:19%;height:9%;background:#1118;border-bottom:3px solid var(--action-color)}
.chm-action-mon,.chm-action-partner{width:100%;height:100%;transform-origin:center bottom}
.chm-action-prop{position:absolute;z-index:4;width:14%;height:23%;left:65%;top:25%;transform-origin:center bottom;filter:drop-shadow(3px 3px 0 #1119)}
.chm-action-prop>svg,.chm-action-prop>span{display:block;width:100%;height:100%}
.chm-action-beam{height:13%;width:100%;background:#dcfaff;box-shadow:0 0 0 2px #5ac8fa,0 0 16px 6px #5ac8fa}
.chm-action-portal{height:100%;border:5px double var(--action-color);background:repeating-linear-gradient(0deg,#141433 0 5px,#27234f 5px 10px);box-shadow:0 0 18px var(--action-color)}
.chm-action-seal,.chm-action-door{display:grid;place-items:center;width:100%;height:100%;border:3px solid #111;background:#f6dc8f;box-shadow:inset -6px -6px 0 #aa692e}
.chm-action-door{position:relative;background:#733d2d;color:#fff1bb;box-shadow:inset -6px -6px 0 #3e2636;font-weight:800;perspective:160px}
.chm-action-door i{position:absolute;right:14%;top:56%;width:12%;height:10%;background:var(--chm-yellow)}
.chm-action-door.is-open{transform:rotateY(-43deg);transform-origin:left center}
.chm-action-sparks{position:absolute;z-index:3;inset:34% 38% 33%;pointer-events:none}
.chm-action-sparks i{display:none;position:absolute;width:6%;aspect-ratio:1;left:calc(var(--i) * 14%);background:var(--action-color);box-shadow:2px 2px #111}
.chm-creature-action[data-landed="true"] .chm-action-sparks i{display:block;animation:chm-spark 720ms steps(7,end) both;animation-delay:calc(var(--i) * 45ms)}
.chm-creature-action[data-landed="true"] :is(.chm-action-prop,.chm-action-mon,.chm-action-partner){animation-iteration-count:1;animation-fill-mode:both}
.chm-action-scan .chm-action-prop{left:32%;width:33%;top:34%;animation:chm-action-sweep 1.25s steps(12,end) infinite}
.chm-action-stamp .chm-action-prop{animation:chm-stamp 880ms steps(7,end) infinite}
.chm-action-crown .chm-action-prop{left:43%;top:13%;animation:chm-crown 1.25s steps(8,end) infinite}
.chm-action-tag .chm-action-prop{animation:chm-tag-swing 1.05s steps(8,end) infinite}
.chm-action-trade .chm-action-prop{animation:chm-trade 1.05s steps(9,end) infinite}
.chm-action-return .chm-action-mon{animation:chm-backtrack 900ms steps(8,end) infinite}
.chm-action-bind .chm-action-prop{animation:chm-bind 1.25s steps(10,end) infinite}
.chm-action-release .chm-action-prop{animation:chm-release 1.25s steps(10,end) infinite}
.chm-action-sacrifice .chm-action-partner{animation:chm-fade-offer 1.3s steps(10,end) infinite}
.chm-action-sacrifice[data-landed="true"] .chm-action-partner{opacity:0;animation:none}
.chm-action-plant .chm-action-prop{animation:chm-plant 1.1s steps(8,end) infinite}
.chm-action-flip .chm-action-prop{animation:chm-flip-card 1s steps(8,end) infinite}
.chm-action-march .chm-action-mon{animation:chm-march 940ms steps(10,end) infinite}
.chm-action-unseal .chm-action-prop{animation:chm-lock 1s steps(8,end) infinite}
.chm-action-sink .chm-action-mon{animation:chm-descend 1.35s steps(9,end) infinite}
.chm-action-door .chm-action-prop{animation:chm-knock 1.2s steps(8,end) infinite}
.chm-action-door[data-landed="true"] .chm-action-prop{animation:chm-door-reveal 480ms steps(6,end) both}
.chm-action-door[data-outcome="treasure"] .chm-action-prop{animation:chm-treasure-hop 720ms steps(8,end) both}
.chm-action-door[data-outcome="stairs"] .chm-action-mon{animation:chm-stair-step 760ms steps(8,end) both}
.chm-action-door[data-outcome="clash"] .chm-action-mon{animation:chm-door-lunge 580ms steps(7,end) both}
.chm-action-door[data-outcome="escape"] .chm-action-mon{animation:chm-door-dodge 650ms steps(8,end) both}
.chm-action-door[data-outcome="trap"] .chm-action-mon{animation:chm-trap-recoil 660ms steps(8,end) both}
.chm-action-door[data-outcome="fall"] .chm-action-mon{animation:chm-depth-fall 760ms steps(8,end) both}
.chm-action-rise .chm-action-mon{animation:chm-climb 1.35s steps(9,end) infinite}
.chm-action-record .chm-action-prop{animation:chm-record 1.15s steps(8,end) infinite}
.chm-action-charge .chm-action-mon{animation:chm-charge 900ms steps(7,end) infinite}
.chm-action-collect .chm-action-prop{animation:chm-collect 1.25s steps(9,end) infinite}
.chm-action-shatter .chm-action-mon{animation:chm-shatter 950ms steps(8,end) infinite}
.chm-action-payout .chm-action-prop{animation:chm-payout 1.2s steps(9,end) infinite}
.chm-creature-action[data-rejected="true"] :is(.chm-action-mon,.chm-action-partner){animation:none}
.chm-creature-action[data-rejected="true"] .chm-action-prop{animation:chm-reject 520ms steps(7,end) both}
.chm-action-appraise .chm-action-prop{animation:chm-appraise 1.1s steps(8,end) infinite}
.chm-action-keyturn .chm-action-prop{animation:chm-keyturn 950ms steps(8,end) infinite}
.chm-action-report .chm-action-prop{animation:chm-report 1.1s steps(8,end) infinite}
.chm-action-lantern .chm-action-prop{animation:chm-lantern 1.1s steps(8,end) infinite}
.chm-action-damage .chm-action-prop{animation:chm-damage 1.1s steps(8,end) infinite}
@keyframes chm-reject{20%,60%{transform:translateX(-14%) rotate(-9deg)}40%,80%{transform:translateX(14%) rotate(9deg)}}
@keyframes chm-appraise{45%{transform:scale(1.24) rotate(12deg);filter:brightness(1.45)}}
@keyframes chm-keyturn{45%{transform:scaleX(.35) rotate(-22deg)}}
@keyframes chm-report{50%{transform:translate(-30%,-22%) rotate(-18deg) scale(1.12)}}
@keyframes chm-lantern{30%{transform:rotate(-14deg);filter:drop-shadow(0 0 8px var(--chm-yellow))}70%{transform:rotate(14deg);filter:drop-shadow(0 0 13px var(--chm-yellow))}}
@keyframes chm-damage{25%{transform:translate(-22%,-8%)}64%{transform:translateY(-28%) scale(1.18)}}
@keyframes chm-action-sweep{0%,100%{transform:translateY(-20%)}50%{transform:translateY(330%)}}
@keyframes chm-stamp{0%{transform:translateY(-45%) scale(1.18);opacity:.35}60%{transform:translateY(7%) scale(.9)}100%{transform:none;opacity:1}}
@keyframes chm-crown{50%{transform:translateY(-35%) rotate(-12deg) scale(1.2)}}
@keyframes chm-tag-swing{25%{transform:rotate(-30deg)}75%{transform:rotate(25deg)}}
@keyframes chm-trade{0%{transform:translate(-180%,30%) rotate(-30deg)}85%,100%{transform:none}}
@keyframes chm-backtrack{30%{transform:translateX(30%) scaleX(-1)}75%{transform:translateX(-28%) scaleX(-1)}}
@keyframes chm-bind{0%{transform:translate(25%,-60%)}70%{transform:translate(-110%,80%) scale(.48)}100%{transform:translate(-110%,80%) scale(.48);opacity:0}}
@keyframes chm-release{0%{transform:translate(-110%,75%) scale(.48)}65%{transform:translate(15%,-30%) scale(1.15)}}
@keyframes chm-fade-offer{0%{opacity:1}65%,100%{opacity:.15;transform:translateY(-40%) scale(.45)}}
@keyframes chm-plant{0%{transform:translateY(-65%) rotate(-25deg)}60%{transform:translateY(8%)}}
@keyframes chm-flip-card{50%{transform:scaleX(.13) translateY(-12%)}}
@keyframes chm-march{25%{transform:translate(-15%,-9%)}50%{transform:translateX(-30%)}75%{transform:translate(-47%,-9%)}}
@keyframes chm-lock{18%,58%{transform:rotate(-17deg)}36%,76%{transform:rotate(17deg)}}
@keyframes chm-descend{0%{transform:translateY(-18%)}85%,100%{transform:translateY(33%) scale(.7);opacity:.35}}
@keyframes chm-knock{22%,45%{transform:rotate(-7deg)}33%,56%{transform:rotate(6deg)}}
@keyframes chm-door-reveal{from{opacity:.4;transform:scaleX(.35)}to{opacity:1;transform:none}}
@keyframes chm-treasure-hop{0%{transform:translateY(23%) scale(.65)}40%{transform:translateY(-36%) scale(1.12)}75%{transform:translateY(4%) scale(.96)}}
@keyframes chm-stair-step{30%{transform:translate(15%,6%) scale(.95)}65%{transform:translate(29%,17%) scale(.85)}100%{transform:translate(39%,31%) scale(.7)}}
@keyframes chm-door-lunge{20%{transform:translateX(-8%) scale(.9,1.04)}48%{transform:translate(53%,-12%) scale(1.14,.94)}}
@keyframes chm-door-dodge{30%{transform:translate(-23%,-15%) skewX(-12deg)}70%{transform:translateX(36%) scale(.94)}}
@keyframes chm-trap-recoil{24%{transform:translateY(-27%) rotate(-11deg);filter:brightness(1.5)}58%{transform:translateX(-24%) rotate(7deg)}}
@keyframes chm-depth-fall{25%{transform:translateY(-8%) rotate(-12deg)}100%{transform:translateY(21%) rotate(-65deg) scale(.72);opacity:.32}}
@keyframes chm-climb{0%{transform:translateY(40%) scale(.7);opacity:.45}85%{transform:translateY(-9%);opacity:1}}
@keyframes chm-record{35%{transform:translateY(20%) rotate(-18deg)}75%{transform:translateY(-22%) rotate(8deg)}}
@keyframes chm-charge{50%{filter:brightness(1.45) drop-shadow(0 0 10px var(--action-color));transform:scale(1.05)}}
@keyframes chm-collect{0%{transform:scale(.65) translateX(40%)}70%{transform:scale(1.2) translateX(-18%)}}
@keyframes chm-shatter{20%,60%{transform:translateX(-6%) rotate(-6deg)}40%,80%{transform:translateX(6%) rotate(6deg)}}
@keyframes chm-payout{20%{transform:translateY(15%) scale(.83)}55%{transform:translateY(-30%) scale(1.18)}}
@keyframes chm-spark{from{opacity:1;transform:translateY(15px) scale(.65)}to{opacity:0;transform:translateY(-28px) scale(1.4)}}
.chm-root button,.chm-root summary,.chm-root a{touch-action:manipulation}
.chm-root *{border-radius:0}
.font-display{font-family:'Space Grotesk',Inter,sans-serif;font-weight:700;letter-spacing:-.035em;line-height:1.08}
.font-display.italic,.font-display .italic{font-style:normal}
.font-mono{font-family:'Courier Prime','Courier New',ui-monospace,monospace}

.chm-panel{background:var(--chm-panel);border:1px solid var(--chm-line);box-shadow:var(--chm-sh)}
.chm-card{display:block;width:100%;background:var(--chm-panel);border:1px solid var(--chm-line);box-shadow:var(--chm-sh);padding:10px;transition:transform .12s,box-shadow .12s,border-color .12s}
button.chm-card:hover,a.chm-card:hover{transform:translateY(-2px);border-color:#848d7e;box-shadow:0 6px 15px #171c2428}
button.chm-card:active,a.chm-card:active{transform:translateY(1px)}
.chm-card.chm-card-on{background:var(--chm-yellow-soft);border-color:#a58a16;box-shadow:inset 0 -3px var(--chm-yellow),0 4px 13px #2634292e}
.chm-floor{display:none}
.chm-art{background:radial-gradient(ellipse at 50% 75%,#606060 0,#606060 41%,#2D2D2D 82%);border:1px solid #778077;overflow:hidden}
.chm-art::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 4px,#26332b38 4px 5px);pointer-events:none}
.chm-art > div{position:relative;filter:drop-shadow(0 6px 5px #121b20a6)}
.chm-specimen-chip{padding:2px 5px;background:#1e2d31e8;border:1px solid #697970;color:#f6edd5;font:700 11px 'Courier Prime',monospace}
.chm-specimen-rare{color:#614076;background:#e9deeb;border:1px solid #c1adc6;padding:2px 4px;font:700 10px 'Courier Prime',monospace;white-space:nowrap}
.chm-specimen-voice{background:linear-gradient(120deg,#263534,#202b34);border:1px solid #65746b;border-left:3px solid var(--chm-yellow);color:#f6efdc;box-shadow:var(--chm-sh)}
.chm-sealed-label{color:var(--chm-yellow)}
.chm-panel.chm-specimen-portrait{background:radial-gradient(ellipse at 50% 46%,#606060,#2D2D2D 63%,#2D2D2D);color:#FFFFFF;border-color:#606060}
.chm-specimen-portrait::before{content:'';position:absolute;left:12%;right:12%;top:12%;aspect-ratio:1;border:1px solid #b5b78b30;border-radius:50%;pointer-events:none;background:radial-gradient(ellipse,transparent 62%,#c5bd8c10 63%,transparent 64%)}
.chm-specimen-portrait .relative > .max-w-full{filter:drop-shadow(0 12px 8px #0b172e66)}

.chm-btn{display:inline-flex;min-height:44px;align-items:center;justify-content:center;gap:8px;padding:8px 14px;font-weight:700;font-size:14px;transition:transform .12s,filter .12s,background .12s;border:1px solid #606060;box-shadow:inset 0 -2px #25322d33;color:var(--chm-ink);background:var(--chm-panel);text-align:center}
.chm-btn:not(:disabled):hover{filter:brightness(1.045)}
.chm-btn:not(:disabled):active{transform:translateY(1px)}
.chm-btn:disabled{opacity:.56;cursor:not-allowed}
.chm-btn-primary,.chm-btn-gold{background:var(--chm-yellow);border-color:#606060;color:var(--chm-brand-ink)}
.chm-btn-primary:not(:disabled):hover,.chm-btn-gold:not(:disabled):hover{background:var(--chm-yellow-hover);filter:none}
.chm-btn-ghost{background:var(--chm-panel);border-color:#606060}
.chm-btn-danger{background:#f5e4df;border-color:#caa69e;color:var(--chm-red)}
.chm-btn-blue{background:var(--chm-charcoal);border-color:var(--chm-black);color:var(--chm-white)}
.chm-btn-arrow::after{content:'↗';font-weight:900;margin-left:2px}

.chm-input{background:#F4F4F4;border:1px solid #aaa494;padding:9px 12px;color:var(--chm-ink);font-family:'Courier Prime',monospace;font-size:16px;outline:none;width:100%}
.chm-input:focus{border-color:var(--chm-black);box-shadow:0 0 0 2px var(--chm-yellow)}
.chm-tactics{background:var(--chm-panel);border:1px solid var(--chm-line);box-shadow:var(--chm-sh)}
.chm-tactic-move{background:var(--chm-panel2);color:var(--chm-dim);border:1px solid var(--chm-line);padding:6px 3px}
.chm-tactic-move:hover{background:var(--chm-yellow-soft)}
.chm-tactic-move[aria-pressed="true"]{color:var(--chm-black);border-color:var(--chm-black);background:var(--chm-yellow);box-shadow:inset 0 -2px var(--chm-black)}
.chm-command-rounds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.chm-command-round{position:relative;display:grid;justify-items:center;gap:7px;min-width:0;min-height:122px;padding:11px 6px;border:1px solid var(--chm-line);background:var(--chm-panel2);color:var(--chm-dim);font-size:13px}
.chm-command-round[data-active="true"]{border-color:var(--chm-black);background:var(--chm-yellow);color:var(--chm-black);box-shadow:inset 0 -3px var(--chm-black)}
.chm-command-pose{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--chm-black);background:var(--chm-charcoal);color:var(--chm-white);animation:chm-command-set 220ms ease-out both}
.chm-command-round[data-active="true"] .chm-command-pose{background:var(--chm-black);color:var(--chm-yellow)}
.chm-command-pose svg{width:26px;height:26px;stroke-width:1.8}
.chm-command-link{position:absolute;right:-13px;top:53px;z-index:1;width:14px;height:14px;color:#817f6b}
.chm-command-choice{display:grid;justify-items:center;gap:4px;min-height:85px;padding:10px 3px}
.chm-command-choice>svg{width:22px;height:22px}.chm-command-choice>b{font-size:13px}.chm-command-choice>small{font:11px 'Courier Prime',monospace}
@keyframes chm-command-set{from{opacity:.5;transform:translateY(5px) scale(.9)}to{opacity:1;transform:none}}
/* One result, one next action; the arena remains the focus. */
.chm-arena-modal{margin-block:clamp(0px,calc(7dvh - 35px),56px) auto;min-width:0}
.chm-arena-modal .chm-stage{box-shadow:0 14px 36px #08081190;border-color:#a8815578}
.chm-arena-status{display:grid;align-items:center;margin-top:8px;min-height:42px;padding:8px 12px;background:#1d1928;color:#eadfcf;border-left:2px solid #c49360;font-size:13px;line-height:1.4}
.chm-battle-summary-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.chm-battle-report{background:#1b1925;color:#f9e8d4;border:1px solid #675044;padding:12px;display:grid;gap:10px}
.chm-battle-report header{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px}
.chm-battle-report header>span{color:#dfb784;font:700 11px 'Courier Prime',monospace}
.chm-battle-report ol{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.chm-battle-report li{min-width:0;padding:8px;background:#242033;border:1px solid #584345}
.chm-report-verdict{display:flex;justify-content:space-between;gap:2px;font:700 11px 'Courier Prime',monospace;color:#e0cdb9}
.chm-report-verdict>span{color:#ffb9a6}.chm-report-verdict>span[data-won="true"]{color:#ffe592}
.chm-report-matchup{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px;margin-top:7px}.chm-report-matchup>svg{width:12px;height:12px;color:#a18b83}
.chm-report-command{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:500}.chm-report-command>svg{width:12px;height:12px;flex:none;color:#d4ae98}
.chm-report-actions .chm-btn-ghost{background:transparent;color:#f6e3ca;border-color:#7e6255}
.chm-stage-control{display:grid;place-items:center;width:40px;height:40px;border:1px solid #ffffff35;background:#2D2D2D;color:#FFFFFF}
.chm-arena-modal .chm-stage-control{width:44px;height:44px}
@media(max-width:475px){.chm-report-matchup{display:grid;justify-content:start}.chm-report-matchup>svg{display:none}.chm-report-actions .chm-btn{flex:1}.chm-arena-modal .chm-stage{aspect-ratio:16/10}}


.chm-nav a{color:#111;padding:6px 8px;font-size:14px;font-weight:700;border:2px solid transparent;transition:background .1s,border-color .1s}
@container chimera (min-width:1536px){.chm-nav a{padding:6px 10px}}
.chm-nav a:hover{border-color:#111;background:#fff}
.chm-nav a.on{background:var(--chm-yellow);border-color:#111;box-shadow:3px 3px 0 #111}

.chm-tag{display:inline-flex;align-items:center;gap:6px;font-family:'Courier Prime',monospace;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;background:var(--chm-yellow);color:#111;border:2px solid #111;box-shadow:3px 3px 0 #111}
.chm-tag-white{background:#fff}.chm-tag-orange{background:#FF7020}.chm-tag-blue{background:#2B50F5;color:#fff}.chm-tag-pink{background:#FF8FC7}.chm-tag-mint{background:#3DDC97}.chm-tag-ink{background:#111;color:#fff}
.chm-hl{display:inline-block;background:var(--chm-yellow);border:4px solid #111;box-shadow:6px 6px 0 #111;padding:.04em .22em .1em}
.chm-sticky{position:absolute;background:var(--chm-yellow);border:2px solid #111;box-shadow:6px 6px 0 #FF7020;font-family:'Courier Prime',monospace;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.25;padding:10px 14px;transform:rotate(-5deg);z-index:5}
.chm-blueprint{background:#2B50F5;border:4px solid #111;box-shadow:10px 10px 0 #111}
.chm-chimera-tag{font-family:'Courier Prime',monospace;font-weight:700;font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;color:#111;background:var(--chm-yellow);border:2px solid #111;box-shadow:2px 2px 0 #111}
.chm-noise{background:repeating-linear-gradient(90deg,#111 0 3px,#fff 3px 5px,#111 5px 6px,#fff 6px 9px);background-size:40px 100%;animation:chm-scan 1.6s linear infinite;border:2px solid #111}
.chm-cipher{font-family:'Courier Prime',monospace;color:#2B50F5;opacity:.55;font-size:11px;line-height:1.35;word-break:break-all;overflow:hidden}
.chm-rule{border-top:3px solid #111}
.chm-dotgrid{background-image:radial-gradient(#11111126 1.3px,transparent 1.3px);background-size:18px 18px}

/* svg animation helpers */
.chm-breathe,.chm-sway,.chm-flap,.chm-spin,.chm-spin-slow,.chm-spin-rev,.chm-flicker,.chm-blink,.chm-float{transform-box:view-box}
.chm-breathe{transform-origin:100px 165px;animation:chm-breathe 4.2s ease-in-out infinite}
.chm-pulse{animation:chm-pulse 3.2s ease-in-out infinite}
.chm-twinkle{animation:chm-twinkle 2.4s ease-in-out infinite}
.chm-spin{animation:chm-spin 18s linear infinite}
.chm-spin-slow{animation:chm-spin 42s linear infinite}
.chm-spin-rev{animation:chm-spin 26s linear infinite reverse}
.chm-sway{animation:chm-sway 3.6s ease-in-out infinite}
.chm-flap{animation:chm-flap 2.8s ease-in-out infinite}
.chm-flicker{animation:chm-flicker 1.4s ease-in-out infinite}
.chm-float{animation:chm-float 3s ease-in-out infinite}
.chm-blink{animation:chm-blink 6s infinite}
.chm-rung{animation:chm-rung 6s ease-in-out infinite}
.chm-hatch{animation:chm-hatch 1.1s cubic-bezier(.2,.9,.2,1.2) both}
.chm-shake{animation:chm-shake .5s ease-in-out infinite}
.chm-pxbob{animation:chm-pxbob 1.1s steps(1,end) infinite}
.chm-pip-on{animation:chm-pxbob 1.6s steps(1,end) infinite}
.chm-pxbox{box-shadow:0 -3px 0 0 #111,0 3px 0 0 #111,-3px 0 0 0 #111,3px 0 0 0 #111,6px 6px 0 0 #111}
.chm-pxbox-sm{box-shadow:0 -2px 0 0 #111,0 2px 0 0 #111,-2px 0 0 0 #111,2px 0 0 0 #111,4px 4px 0 0 #111}
.chm-hg{animation:chm-hg 1.4s steps(1,end) infinite}
@keyframes chm-hg{0%,100%{transform:rotate(0)}50%{transform:rotate(180deg)}}
.chm-pxbar i{display:block;flex:1;height:100%;background:currentColor;animation:chm-pxbar 1.2s steps(1,end) infinite}
@keyframes chm-pxbar{0%,100%{opacity:.18}50%{opacity:1}}
.chm-toast-in{animation:chm-toast-in .3s steps(5,end) both}
@keyframes chm-toast-in{from{transform:translateX(115%)}to{transform:none}}
.chm-pxbob-slow{animation:chm-pxbob 2.2s steps(1,end) infinite}
.chm-pxshake{animation:chm-pxshake .36s steps(1,end) infinite}
.chm-pxblink{opacity:0;animation:chm-pxblink 4.6s steps(1,end) infinite}
.chm-pxtwinkle{animation:chm-pxtwinkle 1.4s steps(1,end) infinite}
.chm-pxtwinkle-b{animation:chm-pxtwinkle 1.4s steps(1,end) infinite;animation-delay:-.7s}
@keyframes chm-pxbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes chm-pxshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-1px)}75%{transform:translateX(1px)}}
@keyframes chm-pxblink{0%,92%{opacity:0}93%,97%{opacity:1}98%,100%{opacity:0}}
@keyframes chm-pxtwinkle{0%,49%{opacity:1}50%,100%{opacity:.25}}
svg[data-animate="0"] *{animation:none!important}

@keyframes chm-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,.975) translateY(1px)}}
@keyframes chm-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes chm-twinkle{0%,100%{opacity:.25}50%{opacity:1}}
@keyframes chm-spin{to{transform:rotate(360deg)}}
@keyframes chm-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes chm-flap{0%,100%{transform:rotate(0) scaleY(1)}50%{transform:rotate(-6deg) scaleY(.92)}}
@keyframes chm-flicker{0%,100%{opacity:1;transform:scaleY(1)}40%{opacity:.75;transform:scaleY(.92)}70%{opacity:.9;transform:scaleY(1.05)}}
@keyframes chm-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes chm-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes chm-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes chm-rung{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}
@keyframes chm-shift{to{background-position:200% 0}}
@keyframes chm-scan{to{background-position:40px 0}}
@keyframes chm-hatch{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes chm-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px) rotate(-1deg)}75%{transform:translateX(3px) rotate(1deg)}}

/* ═════════════ game stage ═════════════ */
.font-pixel{font-family:'Press Start 2P','Courier Prime',monospace;letter-spacing:0;line-height:1.5}
.chm-stage{position:relative;overflow:hidden;border:1px solid #606060;box-shadow:0 10px 32px #080e14aa;background:#1c272e;aspect-ratio:16/9;width:100%;user-select:none}
.chm-stage img,.chm-stage svg{image-rendering:pixelated}
.chm-outline{text-shadow:3px 0 #111,-3px 0 #111,0 3px #111,0 -3px #111,3px 3px #111,-3px 3px #111,3px -3px #111,-3px -3px #111,6px 6px 0 #111}
.chm-caret{display:inline-block;width:.6em;height:.9em;background:#111;margin-left:3px;vertical-align:-1px;animation:chm-pxblink 1s steps(1,end) infinite;opacity:1}
@keyframes chm-caretb{50%{opacity:0}}
.chm-caret{animation:chm-caretb .8s steps(1,end) infinite}
.chm-pip{display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid #64736c;background:#273535;color:#e3e6d7;font-size:11px}
.chm-pip-on{background:var(--chm-yellow);border-color:var(--chm-yellow);color:var(--chm-brand-ink)}
.chm-pip-done{background:#b2cabe;border-color:#b2cabe;color:#233b34}
.chm-pip-now{animation:chm-pipb 1.6s ease-in-out infinite}
@keyframes chm-pipb{50%{background:var(--chm-yellow-soft)}}
.chm-stage-location{border:1px solid #9d8e6e;background:#2b3736;color:var(--chm-yellow);padding:4px 8px;font:700 12px 'Courier Prime',monospace;letter-spacing:.08em}
.chm-stage-dialog{background:#eeeadf;border:1px solid #ac9a77;box-shadow:0 10px 32px #080e1499}
.chm-stage-speaker{color:#3b6157;font:700 12px 'Courier Prime',monospace;letter-spacing:.08em}
.chm-stage-speaker[data-error="true"]{color:#972e26}
.chm-stage-shake{animation:chm-stshake .45s steps(3,end)}
@keyframes chm-stshake{0%{transform:translate(0,0)}20%{transform:translate(-7px,4px)}40%{transform:translate(6px,-4px)}60%{transform:translate(-4px,3px)}80%{transform:translate(3px,-2px)}100%{transform:none}}
.chm-g-bob{animation:chm-gbob .9s steps(2,end) infinite}
@keyframes chm-gbob{50%{transform:translateY(-3%)}}
.chm-g-hop{animation:chm-ghop .45s cubic-bezier(.3,0,.3,1) infinite}
@keyframes chm-ghop{0%,100%{transform:translateY(0) scale(1.06,.94)}50%{transform:translateY(-16%) scale(.96,1.04)}}
.chm-g-charge{animation:chm-gcharge .1s steps(2,end) infinite;filter:drop-shadow(0 0 5px var(--chm-yellow)) drop-shadow(0 0 2px #fff)}
@keyframes chm-gcharge{0%{transform:translateX(-2%)}100%{transform:translateX(2%)}}
.chm-g-lunge{animation:chm-glunge 1s cubic-bezier(.6,0,.2,1) both}
@keyframes chm-glunge{0%{transform:translateX(0)}30%,50%{transform:translateX(var(--lunge,170%))}100%{transform:translateX(0)}}
.chm-g-flinch{animation:chm-gflinch .55s steps(1,end)}
@keyframes chm-gflinch{0%{transform:translateX(5%);filter:brightness(0) invert(1)}25%{transform:translateX(-4%);filter:none}50%{transform:translateX(3%);filter:brightness(0) invert(1)}75%{transform:none;filter:none}}
.chm-g-breathe{animation:chm-gbreathe 2.4s ease-in-out infinite;transform-origin:50% 100%}
@keyframes chm-gbreathe{50%{transform:scale(1.04,.97)}}
.chm-g-roar{animation:chm-groar .35s steps(2,end) 4;transform-origin:50% 100%}
@keyframes chm-groar{0%,100%{transform:scale(1)}50%{transform:scale(1.1,1.06) translateX(-2%)}}
.chm-g-die{animation:chm-gdie 1.8s steps(9,end) forwards;transform-origin:50% 100%}
@keyframes chm-gdie{0%{filter:brightness(0) invert(1);opacity:1}20%{filter:none;opacity:.2}35%{opacity:1}55%{opacity:.2;transform:translateY(6%)}100%{opacity:0;transform:translateY(30%) scaleY(.5);filter:grayscale(1)}}
.chm-g-ko{animation:chm-gko 1s ease-in forwards;transform-origin:50% 100%}
@keyframes chm-gko{0%{transform:none}30%{transform:translateY(-14%) rotate(-12deg)}100%{transform:translateY(10%) rotate(84deg);filter:grayscale(1) brightness(.85);opacity:.8}}
.chm-g-victory{animation:chm-gvic .5s cubic-bezier(.3,0,.3,1) 5}
.chm-g-hurt{animation:chm-ghurt .45s ease-out 1}
@keyframes chm-ghurt{0%{transform:none;filter:none}25%{transform:translateX(-6%);filter:brightness(2.2)}50%{transform:translateX(5%)}75%{transform:translateX(-3%);filter:brightness(1.6)}100%{transform:none;filter:none}}
@keyframes chm-gvic{50%{transform:translateY(-22%)}}
.chm-g-clash-l{animation:chm-gclashl 1.2s ease-in-out infinite}
@keyframes chm-gclashl{0%,100%{transform:translateX(0)}20%{transform:translateX(62%)}30%{transform:translateX(40%)}45%{transform:translateX(0)}}
.chm-g-clash-r{animation:chm-gclashr 1.2s ease-in-out infinite}
@keyframes chm-gclashr{0%,45%,100%{transform:translateX(0)}65%{transform:translateX(-62%)}75%{transform:translateX(-40%)}90%{transform:translateX(0)}}
.chm-g-spark{animation:chm-gspark 1.2s steps(1,end) infinite;opacity:0}
@keyframes chm-gspark{20%{opacity:1;transform:scale(1)}28%{opacity:0}65%{opacity:1;transform:scale(1.25) rotate(45deg)}73%{opacity:0}}
.chm-g-train{animation:chm-gtrain .6s cubic-bezier(.5,0,.3,1) infinite}
@keyframes chm-gtrain{0%,100%{transform:translate(0,0)}35%{transform:translate(48%,-12%)}50%{transform:translate(56%,0)}}
.chm-g-dummy{animation:chm-gdummy .6s ease-out infinite;transform-origin:50% 100%}
@keyframes chm-gdummy{0%,45%,100%{transform:rotate(0)}55%{transform:rotate(14deg)}75%{transform:rotate(-6deg)}}
.chm-g-hitspark{animation:chm-ghitspark .6s steps(1,end) infinite;opacity:0}
@keyframes chm-ghitspark{50%{opacity:1}64%{opacity:0}}
.chm-g-pant{animation:chm-gpant 1.2s ease-in-out infinite;transform-origin:50% 100%}
@keyframes chm-gpant{50%{transform:scale(1.05,.95)}}
.chm-g-walk{animation:chm-gwalk .34s steps(2,end) infinite}
@keyframes chm-gwalk{0%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-6%) rotate(3deg)}}
.chm-g-exit{animation:chm-gexit 2s ease-in forwards}
@keyframes chm-gexit{to{transform:translateX(480%)}}
.chm-g-enter{animation:chm-genter 1.8s ease-out both}
@keyframes chm-genter{from{transform:translateX(360%)}to{transform:none}}
.chm-g-scroll{animation:chm-gscroll 14s linear infinite}
.chm-g-scroll-mid{animation:chm-gscroll 7s linear infinite}
.chm-g-scroll-fast{animation:chm-gscroll 3.5s linear infinite}
.chm-g-paused{animation-play-state:paused}
@keyframes chm-gscroll{to{transform:translateX(-50%)}}
.chm-g-wobble{animation:chm-gwobble .45s ease-in-out infinite;transform-origin:50% 90%}
@keyframes chm-gwobble{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
.chm-g-tubeup{animation:chm-gtubeup .9s cubic-bezier(.5,0,.2,1) forwards}
.chm-g-hatch-key{animation:chm-hatch-key 1.15s steps(9,end) infinite}
.chm-incubator-light{animation:chm-incubator-light 1.6s ease-in-out infinite}
@keyframes chm-incubator-light{0%,100%{opacity:1}50%{opacity:.42}}
.chm-incubator-scan{position:absolute;left:4%;right:4%;top:13%;height:7%;background:#aaffdc80;border-block:2px solid #a8ffe4;animation:chm-incubator-scan 1.3s steps(14,end) infinite alternate}
@keyframes chm-incubator-scan{to{transform:translateY(930%)}}
.chm-hatch-focus{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 60%,#86dac53d 0,transparent 39%),radial-gradient(ellipse at 50% 50%,transparent 22%,#09111aa8 90%)}
.chm-hatch-focus[data-beat="1"]{background:radial-gradient(ellipse at 50% 61%,#ffc56960 0,transparent 40%),radial-gradient(ellipse at 50% 50%,transparent 20%,#09111ac7 90%)}
.chm-hatch-focus[data-beat="2"]{background:radial-gradient(ellipse at 50% 59%,#ffe6a747 0,transparent 44%),radial-gradient(ellipse at 50% 50%,transparent 25%,#09111ad1 90%)}
.chm-hatch-cracking{animation:chm-hatch-crack-pose 740ms steps(10,end) both;transform-origin:center 80%;filter:drop-shadow(0 0 7px #ffdf93a0)}
.chm-hatch-arrival{animation:chm-hatch-land 810ms cubic-bezier(.14,.72,.21,1) both;transform-origin:center 86%;filter:drop-shadow(0 0 9px #ffe2a170)}
.chm-hatch-shards{position:absolute;top:59%;left:50%;width:0;height:0;z-index:5;color:#ffe4a2;pointer-events:none}
.chm-hatch-shards i{position:absolute;left:0;top:0;width:clamp(24px,10cqw,80px);aspect-ratio:1;border:2px solid #ffefad;translate:-50% -50%;rotate:45deg;box-shadow:0 0 16px #ffdeaab2;animation:chm-hatch-ring 580ms ease-out both}
.chm-hatch-shards b{position:absolute;width:clamp(4px,1.1cqw,10px);aspect-ratio:1;background:#ffe9ad;box-shadow:2px 2px #83635f;clip-path:polygon(0 0,65% 0,65% 30%,100% 30%,100% 70%,55% 70%,55% 100%,0 100%);animation:chm-hatch-shard 690ms cubic-bezier(.12,.66,.36,1) both}
@keyframes chm-hatch-crack-pose{20%,56%{transform:translateX(-4%) rotate(-9deg) scale(1.07,.93)}38%,82%{transform:translateX(6%) rotate(10deg)}100%{transform:scale(.92,1.09)}}
@keyframes chm-hatch-ring{0%{transform:scale(.2);opacity:.28}26%{opacity:1}100%{transform:scale(2.4);opacity:0}}
@keyframes chm-hatch-shard{0%{opacity:.25;transform:scale(.35)}22%,61%{opacity:1}65%{transform:translate(calc(var(--dx) * 1px),calc(var(--dy) * 1px)) rotate(var(--turn))}100%{transform:translate(calc(var(--dx) * 1.2px),calc(var(--dy) * .42px)) rotate(var(--turn)) scale(.7);opacity:0}}
@keyframes chm-hatch-land{0%{opacity:0;transform:translateY(8%) scale(.55)}24%{opacity:1;transform:translateY(-33%) scale(.94,1.11)}67%{transform:translateY(4%) scale(1.09,.88)}83%{transform:translateY(-6%) scale(.99,1.03)}100%{transform:none}}
.chm-shell-crack{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
@keyframes chm-hatch-key{24%{transform:scale(.91,1.06) rotate(-7deg)}56%{transform:translateY(-13%) rotate(8deg)}78%{transform:scale(1.08,.9)}}
.chm-g-train-proof{animation:chm-train-proof .9s steps(8,end) infinite}
@keyframes chm-train-proof{35%{transform:translateY(-22%) scale(1.1)}70%{transform:translateY(9%) scale(.92)}}
@keyframes chm-gtubeup{to{transform:translateY(-130%)}}
.chm-g-bubble{animation:chm-gbubble var(--d,2s) linear infinite;animation-delay:var(--dl,0s)}
@keyframes chm-gbubble{from{transform:translateY(0);opacity:.9}to{transform:translateY(-900%);opacity:0}}
.chm-g-ember{animation:chm-gember var(--d,4s) linear infinite;animation-delay:var(--dl,0s);opacity:0}
@keyframes chm-gember{0%{transform:translate(0,0);opacity:0}10%{opacity:1}100%{transform:translate(var(--dx,10px),-420%);opacity:0}}
.chm-g-burst{animation:chm-gburst .9s cubic-bezier(.1,.7,.3,1) forwards}
@keyframes chm-gburst{from{transform:translate(0,0) scale(1);opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(.3);opacity:0}}
.chm-g-pop{animation:chm-gpop 1.9s cubic-bezier(.2,.9,.2,1.2) forwards}
@keyframes chm-gpop{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}15%{transform:translate(-50%,-50%) scale(1.25);opacity:1}25%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1;transform:translate(-50%,-90%) scale(1)}100%{opacity:0;transform:translate(-50%,-120%)}}
.chm-g-stay{animation:chm-gstay .6s cubic-bezier(.2,.9,.2,1.3) both}
@keyframes chm-gstay{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}60%{transform:translate(-50%,-50%) scale(1.15);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
.chm-g-flash{animation:chm-gflash .55s ease-out forwards;background:#fff;pointer-events:none}
@keyframes chm-gflash{from{opacity:.95}to{opacity:0}}
.chm-g-rain{animation:chm-grain var(--d,2.2s) linear infinite;animation-delay:var(--dl,0s)}
@keyframes chm-grain{from{transform:translateY(-105%)}to{transform:translateY(105%)}}
.chm-g-coinfall{animation:chm-gcoin var(--d,1.3s) cubic-bezier(.5,0,1,1) infinite;animation-delay:var(--dl,0s)}
@keyframes chm-gcoin{from{transform:translateY(-120%) rotate(0)}to{transform:translateY(var(--fall,900%)) rotate(360deg)}}
.chm-g-heart{animation:chm-gheart 2s ease-out infinite;animation-delay:var(--dl,0s);opacity:0}
@keyframes chm-gheart{0%{transform:translateY(0) scale(.6);opacity:0}20%{opacity:1}100%{transform:translateY(-300%) scale(1.15);opacity:0}}
.chm-g-evo{animation:chm-gevo .18s steps(1,end) infinite}
@keyframes chm-gevo{50%{filter:brightness(0) invert(1)}}
.chm-g-alert{animation:chm-galert .6s steps(2,end) infinite}
@keyframes chm-galert{50%{transform:translateY(-14%)}}
.chm-g-fadein{animation:chm-rise .4s ease-out both}
.chm-g-glow{animation:chm-gglow 1s ease-in-out infinite}
@keyframes chm-gglow{50%{filter:drop-shadow(0 0 8px var(--chm-yellow)) brightness(1.15)}}
.chm-g-beam{animation:chm-gbeam .5s linear infinite;background-size:16px 100%}
@keyframes chm-gbeam{to{background-position:16px 0}}
.chm-g-roam{animation:chm-groam var(--d,14s) ease-in-out infinite;animation-delay:var(--dl,0s)}
@keyframes chm-groam{0%{transform:translateX(0) scaleX(1)}45%{transform:translateX(var(--dist,200px)) scaleX(1)}50%{transform:translateX(var(--dist,200px)) scaleX(-1)}95%{transform:translateX(0) scaleX(-1)}100%{transform:translateX(0) scaleX(1)}}
.chm-g-roamx{animation:chm-groamx var(--d,14s) ease-in-out infinite;animation-delay:var(--dl,0s)}
@keyframes chm-groamx{0%,100%{transform:translateX(0)}45%,50%{transform:translateX(var(--dist,200px))}95%{transform:translateX(0)}}
.chm-g-flipx{animation:chm-gflipx var(--d,14s) ease-in-out infinite;animation-delay:var(--dl,0s)}
@keyframes chm-gflipx{0%,45%{transform:scaleX(1)}50%,95%{transform:scaleX(-1)}100%{transform:scaleX(1)}}
.chm-root{overflow-x:clip;cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='21' height='30' viewBox='0 0 12 17' shape-rendering='crispEdges'%3E%3Crect x='0' y='0' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='1' width='2' height='1' fill='%23111'/%3E%3Crect x='0' y='2' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='2' width='1' height='1' fill='%23fff'/%3E%3Crect x='2' y='2' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='3' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='3' width='2' height='1' fill='%23fff'/%3E%3Crect x='3' y='3' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='4' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='4' width='3' height='1' fill='%23fff'/%3E%3Crect x='4' y='4' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='5' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='5' width='4' height='1' fill='%23fff'/%3E%3Crect x='5' y='5' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='6' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='6' width='5' height='1' fill='%23fff'/%3E%3Crect x='6' y='6' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='7' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='7' width='6' height='1' fill='%23fff'/%3E%3Crect x='7' y='7' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='8' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='8' width='7' height='1' fill='%23fff'/%3E%3Crect x='8' y='8' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='9' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='9' width='8' height='1' fill='%23fff'/%3E%3Crect x='9' y='9' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='10' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='10' width='5' height='1' fill='%23fff'/%3E%3Crect x='6' y='10' width='5' height='1' fill='%23111'/%3E%3Crect x='0' y='11' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='11' width='2' height='1' fill='%23fff'/%3E%3Crect x='3' y='11' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='11' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='11' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='12' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='12' width='1' height='1' fill='%23fff'/%3E%3Crect x='2' y='12' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='12' width='1' height='1' fill='%23111'/%3E%3Crect x='5' y='12' width='2' height='1' fill='%23fff'/%3E%3Crect x='7' y='12' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='13' width='2' height='1' fill='%23111'/%3E%3Crect x='4' y='13' width='1' height='1' fill='%23111'/%3E%3Crect x='5' y='13' width='2' height='1' fill='%23fff'/%3E%3Crect x='7' y='13' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='14' width='1' height='1' fill='%23111'/%3E%3Crect x='5' y='14' width='1' height='1' fill='%23111'/%3E%3Crect x='6' y='14' width='2' height='1' fill='%23fff'/%3E%3Crect x='8' y='14' width='1' height='1' fill='%23111'/%3E%3Crect x='5' y='15' width='1' height='1' fill='%23111'/%3E%3Crect x='6' y='15' width='2' height='1' fill='%23fff'/%3E%3Crect x='8' y='15' width='1' height='1' fill='%23111'/%3E%3Crect x='6' y='16' width='2' height='1' fill='%23111'/%3E%3C/svg%3E") 0 0,auto}
.chm-root :is(button,a,[role=button],summary,select,.cursor-pointer){cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 14 16' shape-rendering='crispEdges'%3E%3Crect x='4' y='0' width='2' height='1' fill='%23111'/%3E%3Crect x='3' y='1' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='1' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='1' width='1' height='1' fill='%23111'/%3E%3Crect x='3' y='2' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='2' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='2' width='1' height='1' fill='%23111'/%3E%3Crect x='3' y='3' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='3' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='3' width='1' height='1' fill='%23111'/%3E%3Crect x='3' y='4' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='4' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='4' width='3' height='1' fill='%23111'/%3E%3Crect x='3' y='5' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='5' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='5' width='1' height='1' fill='%23111'/%3E%3Crect x='7' y='5' width='2' height='1' fill='%23fff'/%3E%3Crect x='9' y='5' width='3' height='1' fill='%23111'/%3E%3Crect x='1' y='6' width='3' height='1' fill='%23111'/%3E%3Crect x='4' y='6' width='2' height='1' fill='%23fff'/%3E%3Crect x='6' y='6' width='1' height='1' fill='%23111'/%3E%3Crect x='7' y='6' width='2' height='1' fill='%23fff'/%3E%3Crect x='9' y='6' width='1' height='1' fill='%23111'/%3E%3Crect x='10' y='6' width='2' height='1' fill='%23fff'/%3E%3Crect x='12' y='6' width='1' height='1' fill='%23111'/%3E%3Crect x='0' y='7' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='7' width='2' height='1' fill='%23fff'/%3E%3Crect x='3' y='7' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='7' width='8' height='1' fill='%23fff'/%3E%3Crect x='12' y='7' width='2' height='1' fill='%23111'/%3E%3Crect x='0' y='8' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='8' width='2' height='1' fill='%23fff'/%3E%3Crect x='3' y='8' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='8' width='9' height='1' fill='%23fff'/%3E%3Crect x='13' y='8' width='1' height='1' fill='%23111'/%3E%3Crect x='1' y='9' width='1' height='1' fill='%23111'/%3E%3Crect x='2' y='9' width='11' height='1' fill='%23fff'/%3E%3Crect x='13' y='9' width='1' height='1' fill='%23111'/%3E%3Crect x='2' y='10' width='1' height='1' fill='%23111'/%3E%3Crect x='3' y='10' width='10' height='1' fill='%23fff'/%3E%3Crect x='13' y='10' width='1' height='1' fill='%23111'/%3E%3Crect x='2' y='11' width='1' height='1' fill='%23111'/%3E%3Crect x='3' y='11' width='9' height='1' fill='%23fff'/%3E%3Crect x='12' y='11' width='1' height='1' fill='%23111'/%3E%3Crect x='3' y='12' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='12' width='8' height='1' fill='%23fff'/%3E%3Crect x='12' y='12' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='13' width='1' height='1' fill='%23111'/%3E%3Crect x='5' y='13' width='6' height='1' fill='%23fff'/%3E%3Crect x='11' y='13' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='14' width='1' height='1' fill='%23111'/%3E%3Crect x='5' y='14' width='6' height='1' fill='%23FD0'/%3E%3Crect x='11' y='14' width='1' height='1' fill='%23111'/%3E%3Crect x='4' y='15' width='8' height='1' fill='%23111'/%3E%3C/svg%3E") 7 0,pointer}
.chm-root :is(button:disabled,[aria-disabled=true]){cursor:not-allowed}
.chm-root :is(input,textarea){cursor:text}
.chm-m-anim{transform-box:fill-box;transform-origin:center}
.chm-m-glow{animation:chm-mglow 3.2s ease-in-out infinite}
@keyframes chm-mglow{0%,100%{opacity:.4}50%{opacity:1}}
.chm-m-particle{animation:chm-mparticle 1.8s steps(6,end) infinite}
@keyframes chm-mparticle{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-6px);opacity:0}}
.chm-m-lantern{transform-box:fill-box;transform-origin:center top;animation:chm-mlantern 2.4s steps(5,end) infinite}
@keyframes chm-mlantern{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
.chm-m-current{animation:chm-mcurrent 1.8s steps(6,end) infinite}
@keyframes chm-mcurrent{0%{transform:translateY(0);opacity:0}25%,70%{opacity:1}100%{transform:translateY(-12px);opacity:0}}
.chm-m-awning{transform-box:fill-box;transform-origin:center top;animation:chm-mawning 1.7s steps(4,end) infinite}
@keyframes chm-mawning{0%,100%{transform:none}50%{transform:skewX(10deg) scaleY(.65)}}
.chm-m-blink{animation:chm-mblink 1.2s steps(1,end) infinite}
@keyframes chm-mblink{0%,59%{opacity:1}60%,100%{opacity:.15}}
.chm-m-smoke{transform-box:fill-box;animation:chm-msmoke 3.2s linear infinite}
@keyframes chm-msmoke{0%{transform:translate(0,0);opacity:0}15%{opacity:.85}100%{transform:translate(3px,-12px);opacity:0}}
.chm-m-flag{transform-box:fill-box;transform-origin:left center;animation:chm-mflag .8s steps(2,end) infinite}
@keyframes chm-mflag{0%,100%{transform:none}50%{transform:skewY(11deg) scaleX(.55)}}
.chm-m-swirl{animation:chm-mswirl 1.6s steps(4,end) infinite}
@keyframes chm-mswirl{0%{opacity:1}25%{opacity:.35}50%{opacity:.8}75%{opacity:.2}}
.chm-m-cloud{animation:chm-mcloud var(--d,60s) linear infinite;animation-delay:var(--dl,0s)}
@keyframes chm-mcloud{0%{transform:translateX(-40px)}100%{transform:translateX(240px)}}
.chm-m-ripple{transform-box:fill-box;transform-origin:center;animation:chm-mripple 2.4s ease-out infinite}
@keyframes chm-mripple{0%{transform:scale(.3);opacity:.9}100%{transform:scale(1.4);opacity:0}}
.chm-m-bob{animation:chm-mbob 1.1s steps(2,end) infinite}
@keyframes chm-mbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-12%)}}
.chm-m-arrow{animation:chm-marrow .7s ease-in-out infinite alternate}
@keyframes chm-marrow{0%{transform:translate(-50%,-6px)}100%{transform:translate(-50%,4px)}}
.chm-m-bld{transition:filter .12s;cursor:pointer;outline:none}
.chm-m-bld:hover,.chm-m-bld:focus-visible{filter:brightness(1.08) drop-shadow(0 0 0 #fff)}
.chm-g-steps{animation:chm-gwalk .4s steps(2,end) infinite}

.chm-world-map [data-place]{scroll-margin-block:5rem 1rem}
.chm-root :focus-visible:not(.chm-m-bld){outline:3px solid #2B50F5;outline-offset:3px}

/* Compact location strip: world art frames the task instead of pushing it down. */
.chm-location,.chm-location.chm-location-file{min-height:96px;align-items:center;box-shadow:none;border-color:#2D2D2D;border-bottom:1px solid #606060;border-left:3px solid var(--chm-yellow)}
.chm-location-copy,.chm-location-file .chm-location-copy{padding:18px 24px}
.chm-location h1,.chm-location-file h1{font-size:30px;line-height:1.1;letter-spacing:-.035em}
.chm-location-building{width:110px;right:7%;height:92%;bottom:-10%;opacity:.55}
.chm-location-item{width:35px;right:25%;opacity:.5}.chm-location-status{margin-top:7px;font-size:12px;color:#BDBDBD}
.chm-location-art::after{background:linear-gradient(90deg,#000000 12%,#000000ee 40%,#00000090 100%)}
.chm-arena-workbench{display:grid;grid-template-columns:minmax(0,1fr) 360px;background:#000000;border:1px solid #2D2D2D;overflow:hidden}
.chm-arena-preview{min-width:0;display:flex;flex-direction:column;background:#000000}
.chm-prep-scene{position:relative;isolation:isolate;overflow:hidden;min-height:340px;flex:1}
.chm-prep-scene::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,#000000 0%,transparent 32%,#1b201e30 75%,#00000090)}
.chm-prep-caption{position:absolute;top:20px;left:24px;z-index:1;color:#fff0ca;letter-spacing:.15em;font:11px 'Courier Prime',monospace}
.chm-prep-champion,.chm-prep-unknown{position:absolute;bottom:36px;display:flex;flex-direction:column;align-items:center;width:42%;z-index:1;color:#eee}
.chm-prep-champion{left:3%}.chm-prep-unknown{right:3%}.chm-prep-silhouette{filter:brightness(0) drop-shadow(0 0 9px #ffd20955);opacity:.75;animation:chm-gbob 3s ease-in-out infinite}
.chm-prep-name{display:grid;text-align:center;gap:5px;margin-top:8px;min-width:0}.chm-prep-name>b{font:600 18px 'Space Grotesk',sans-serif;letter-spacing:-.02em}.chm-prep-name>small{display:flex;justify-content:center;align-items:center;gap:5px;color:#BDBDBD;font-size:11px}
.chm-prep-vs{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);color:#ffecc0a0;font:500 20px 'Space Grotesk',sans-serif;letter-spacing:.12em}
.chm-specimen-roster{display:flex;gap:8px;padding:16px;overflow-x:auto;border-top:1px solid #2D2D2D;min-height:88px}
.chm-specimen-roster button{display:flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border:1px solid #2D2D2D;color:#BDBDBD;background:#000000;min-width:0;flex-shrink:0;text-align:left}
.chm-specimen-roster button[aria-pressed="true"]{border-color:var(--chm-yellow);box-shadow:inset 0 -2px var(--chm-yellow);color:#fff}
.chm-roster-name{display:grid;gap:4px}.chm-roster-name b{font-size:12px}.chm-roster-name small{font:11px 'Courier Prime',monospace;color:#BDBDBD}
.chm-arena-console{background:#FFFFFF;display:flex;flex-direction:column;min-width:0;border-left:1px solid #2D2D2D}
.chm-console-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 18px 0;font:700 10px 'Courier Prime',monospace;letter-spacing:.08em}.chm-console-heading small{font-size:10px;letter-spacing:0;color:#606060;font-weight:400}
.chm-arena-console .chm-command-board{border:0;box-shadow:none;background:transparent;padding:18px}
.chm-arena-console .chm-command-board>div:first-child>div{font:600 19px 'Space Grotesk',sans-serif;text-transform:none;letter-spacing:-.02em}
.chm-arena-console .chm-command-board>div:first-child{align-items:center}.chm-arena-console .chm-command-board>div:first-child button{padding:0 4px!important;border:0;background:transparent;color:#606060;font-size:11px!important;box-shadow:none;min-height:32px}
.chm-arena-console .chm-command-rounds{gap:8px}.chm-arena-console .chm-command-round{min-height:104px;gap:5px;padding:10px 4px;background:#F4F4F4;border-color:#D4D4D4}
.chm-arena-console .chm-command-round[data-active="true"]{background:var(--chm-yellow);border-color:var(--chm-black)}.chm-arena-console .chm-command-pose{width:40px;height:40px}.chm-arena-console .chm-command-pose>svg{width:23px;height:23px}
.chm-arena-console .chm-command-choice{min-height:72px;box-shadow:none;border-width:1px;background:#F4F4F4;color:#606060;border-color:#D4D4D4}.chm-arena-console .chm-command-choice[aria-pressed="true"]{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-black)}
.chm-arena-console .chm-command-link{display:none}.chm-hunt-entry{margin-top:auto;padding:0 18px 18px}.chm-hunt-entry .chm-btn{width:100%;min-height:48px}.chm-hunt-entry p{margin-top:10px;text-align:center;font-size:11px;color:#606060;line-height:1.5}
.chm-roaming-list>summary{display:flex;align-items:center;justify-content:space-between;cursor:pointer;min-height:52px;padding:14px 18px;font-size:13px;font-weight:600}.chm-roaming-list>summary:after{content:'+';margin-left:12px}.chm-roaming-list[open]>summary:after{content:'−'}.chm-roaming-list>summary span{margin-left:auto;font:11px 'Courier Prime',monospace;color:var(--chm-dim)}
.chm-log-row{position:relative;display:grid;grid-template-columns:42px 92px minmax(90px,1fr) 130px 72px 88px;gap:12px;align-items:center;padding:16px 20px;font-size:13px}.chm-log-opponents{font-weight:600}.chm-log-score{display:grid;gap:3px;font:600 22px 'Space Grotesk',sans-serif}.chm-log-score small{font:11px 'Inter',sans-serif;color:var(--chm-dim)}
.chm-log-details{display:contents}.chm-log-details>summary{cursor:pointer;grid-column:5;grid-row:1;color:var(--chm-dim);font-size:12px;min-height:44px;display:flex;align-items:center}.chm-log-details>summary::after{content:' +';margin-left:4px}.chm-log-details[open]>summary::after{content:' −'}.chm-log-detail-body{grid-column:1/-1;grid-row:2;display:flex;gap:20px;flex-wrap:wrap;align-items:center;padding:16px;background:var(--chm-panel2);border-top:1px solid var(--chm-line)}.chm-log-row>.chm-btn{grid-column:6;grid-row:1}
@container chimera (max-width:900px){.chm-arena-workbench{grid-template-columns:minmax(0,1fr) 330px}.chm-prep-champion>svg{width:150px;height:150px}.chm-prep-silhouette>svg{width:135px;height:135px}.chm-prep-name>b{font-size:15px}.chm-prep-caption{font-size:10px;left:16px}}
@container chimera (max-width:700px){.chm-location-copy,.chm-location-file .chm-location-copy{padding:16px}.chm-location h1{font-size:27px}.chm-arena-workbench{grid-template-columns:minmax(0,1fr)}.chm-arena-console{border-left:0;border-top:1px solid #2D2D2D}.chm-prep-scene{min-height:260px}.chm-prep-champion,.chm-prep-unknown{bottom:24px}.chm-specimen-roster{padding:10px;min-height:74px}.chm-specimen-roster button{padding-right:10px}.chm-arena-console .chm-command-board{padding:16px}.chm-log-row{grid-template-columns:35px 1fr 64px 72px;gap:9px;padding:14px}.chm-log-opponents{grid-column:2;grid-row:2}.chm-log-score{grid-column:3;grid-row:1/3;font-size:20px}.chm-log-score small{font-size:10px}.chm-log-details>summary{grid-column:2;grid-row:3}.chm-log-detail-body{grid-row:4;padding:12px}.chm-log-row>.chm-btn{grid-column:4;grid-row:1/3}.chm-log-row>span:nth-child(2){grid-column:2}.chm-log-row>span:first-child{grid-row:1/3}.chm-specimen-roster button svg{width:40px;height:40px}}

.chm-log-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.chm-log-heading>div{display:flex;gap:5px}.chm-log-heading .chm-mode{font-size:12px;min-height:36px}.chm-log-heading>span{font:11px 'Courier Prime',monospace;color:var(--chm-dim)}.chm-log-pending{grid-column:4;color:#806e22;font-size:12px}
@container chimera (max-width:700px){.chm-log-heading{align-items:start;flex-direction:column}.chm-log-pending{grid-column:3;grid-row:1/3;font-size:10px}}

.chm-location-copy{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:20px;align-items:center}.chm-location-copy>h1{grid-column:1;grid-row:1;max-width:100%}.chm-location-copy>.chm-location-status{grid-column:1;grid-row:2}.chm-location-copy>.chm-location-actions{grid-column:2;grid-row:1/3;margin:0;justify-content:flex-end;max-width:100%}
.chm-location-actions .chm-btn-ghost{background:#000000;color:#BDBDBD;border-color:#606060}
.chm-lab-key{border:1px solid var(--chm-line);background:var(--chm-panel);color:var(--chm-ink)}.chm-lab-key summary{font-size:13px;font-weight:600;padding:10px 16px}
.chm-specimen-file .chm-specimen-portrait{box-shadow:none}.chm-specimen-file .chm-specimen-voice{box-shadow:none}.chm-specimen-file .chm-specimen-voice blockquote{font-size:17px;line-height:1.4}.chm-specimen-file .chm-specimen-voice>p{color:#BDBDBD;font-size:11px;line-height:1.6}.chm-specimen-file .chm-specimen-voice .chm-btn-ghost{background:transparent;border-color:#606060;color:#FFFFFF}
@container chimera (min-width:1024px){.chm-specimen-file>.grid>div:first-child{position:sticky;top:84px;align-self:start}}
@container chimera (max-width:639px){.chm-location-copy{grid-template-columns:minmax(0,1fr)}.chm-location-copy>.chm-location-actions{grid-column:1;grid-row:3;justify-content:flex-start;margin-top:12px}.chm-specimen-file .chm-specimen-portrait>div:first-child svg{max-height:240px}.chm-specimen-file .chm-specimen-portrait{padding:16px}}

@container chimera (max-width:480px){.chm-hud-account span,.chm-hud-account svg:last-child{display:none}.chm-hud-row{gap:8px}.chm-hud-tools{gap:5px}}

@container chimera (max-width:700px){.chm-specimen-file:not([data-section="overview"]) .chm-specimen-portrait{display:flex;align-items:center;gap:16px;padding:12px 16px}.chm-specimen-file:not([data-section="overview"]) .chm-specimen-portrait>div:first-child{width:88px;flex:none}.chm-specimen-file:not([data-section="overview"]) .chm-specimen-portrait>div:last-child{margin:0;text-align:left}.chm-specimen-file:not([data-section="overview"]) .chm-specimen-portrait h2{font-size:22px;margin:0}.chm-specimen-file:not([data-section="overview"]) .chm-specimen-portrait>div:last-child>div{font-size:10px;line-height:1.6}}

.chm-specimen-file .chm-pxbox{border:1px solid var(--chm-line);box-shadow:none;background:var(--chm-panel)}.chm-specimen-file .chm-pxbox>.flex>.font-pixel{font-family:'Courier Prime',monospace;font-size:12px}
@container chimera (max-width:700px){.chm-specimen-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.chm-specimen-tabs .chm-mode{justify-content:center;min-width:0;padding:6px 4px;font-size:12px}}

/* The nursery shares the arena's scene / roster / action-console structure. */
.chm-roster-badge{display:grid;place-items:center;width:22px;height:22px;margin-left:6px;background:var(--chm-yellow);color:#000000;font:700 12px 'Courier Prime',monospace}
.chm-breed-workbench{display:grid;grid-template-columns:minmax(0,1fr) 330px;border:1px solid #2D2D2D;background:#000000;overflow:hidden}.chm-breed-lab{min-width:0;display:flex;flex-direction:column}.chm-breed-scene{position:relative;isolation:isolate;flex:1;min-height:350px;display:flex;align-items:end;padding:54px 24px 28px}
.chm-breed-scene>svg{z-index:-2}
.chm-breed-scene::after{content:'';position:absolute;z-index:-1;inset:0;background:linear-gradient(0deg,#000000 0%,#00000088 35%,#00000066 70%,#000000b0)}
.chm-breed-pair{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);align-items:center;width:100%;gap:12px}
.chm-parent-slot{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0;color:#FFFFFF}.chm-parent-label{font:11px 'Courier Prime',monospace;letter-spacing:.12em;text-transform:uppercase;color:#BDBDBD;margin-bottom:14px}.chm-parent-slot>svg{max-width:100%;height:auto}.chm-parent-slot h3{margin-top:12px;font:600 19px 'Space Grotesk',sans-serif;letter-spacing:-.025em}.chm-parent-slot>small{margin-top:5px;font:11px 'Courier Prime',monospace;color:#BDBDBD}.chm-parent-status{margin-top:10px;font-size:11px;color:#BDBDBD}.chm-parent-clear{position:absolute;right:0;top:-12px;min-width:44px;min-height:44px;font-size:24px;color:#BDBDBD;background:transparent}.chm-parent-clear:hover{color:var(--chm-yellow)}
.chm-parent-placeholder{display:grid;place-items:center;width:164px;max-width:100%;height:164px;border:1px dashed #80927a70;background:#000000a0}.chm-parent-placeholder>svg{width:50px;height:50px;stroke-width:1;color:#BDBDBD}.chm-breed-link{width:28px;height:28px;color:var(--chm-yellow);opacity:.75}
.chm-breed-console{display:flex;flex-direction:column;min-width:0;padding:24px;background:#FFFFFF;border-left:1px solid #2D2D2D}.chm-console-eyebrow{font:700 10px 'Courier Prime',monospace;letter-spacing:.12em;color:#606060}.chm-offspring-preview{align-self:center;margin:14px 0}.chm-breed-console>h2{font-size:23px;letter-spacing:-.03em}.chm-breed-console>p{margin-top:8px;font-size:12px;line-height:1.65;color:#606060}.chm-breed-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:11px;padding-block:18px;margin-block:12px;border-top:1px solid #D4D4D4;font-size:12px;color:#606060}.chm-breed-summary b{color:#606060;font-weight:600}.chm-breed-console>.chm-btn{min-height:48px;width:100%;margin-top:auto}.chm-breed-console>p.chm-breed-warning{color:#9c4b18}.chm-breed-privacy{display:flex;gap:8px;margin-top:16px;color:#606060;font-size:11px;line-height:1.6}.chm-breed-privacy>svg{flex:none;margin-top:2px}
@container chimera (max-width:900px){.chm-breed-workbench{grid-template-columns:minmax(0,1fr) 300px}.chm-breed-scene{padding-inline:16px}.chm-breed-pair{gap:8px}.chm-parent-slot h3{font-size:16px}.chm-parent-slot>svg{width:130px}.chm-parent-placeholder{width:130px;height:130px}}
@container chimera (max-width:700px){.chm-breed-workbench{grid-template-columns:minmax(0,1fr)}.chm-breed-scene{min-height:310px;padding:48px 12px 22px}.chm-breed-pair{grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);gap:5px}.chm-breed-link{width:20px;height:20px}.chm-parent-slot>small{font-size:10px}.chm-parent-slot h3{font-size:15px}.chm-parent-label{font-size:10px}.chm-parent-clear{right:-6px}.chm-breed-console{border-left:0;border-top:1px solid #2D2D2D;padding:20px}.chm-offspring-preview{margin:10px 0}.chm-offspring-preview>svg{width:72px;height:72px}.chm-breed-summary{margin-block:12px}.chm-breed-console>h2{font-size:22px}}

@container chimera (max-width:700px){.chm-specimen-roster button{gap:5px;padding:5px 8px 5px 5px}.chm-specimen-roster .chm-roster-name b{font-size:11px}.chm-specimen-roster .chm-roster-name small{font-size:10px}.chm-roster-badge{margin-left:0;width:18px;height:18px;font-size:11px}.chm-breed-console{position:relative}.chm-breed-console>.chm-offspring-preview{position:absolute;right:18px;top:14px;margin:0}.chm-offspring-preview>svg{width:56px;height:56px}.chm-breed-console>h2{margin-top:12px;padding-right:56px;font-size:20px}.chm-breed-console>p:first-of-type{padding-right:56px;font-size:11px}.chm-breed-console .chm-breed-summary{margin-top:16px}}

/* One fluid mobile surface, centered in larger browser windows. */
body:has(.chm-root){margin:0;overflow:hidden;background:#000000}
.chm-root{container-name:chimera;container-type:inline-size;position:relative;isolation:isolate;transform:translateZ(0);width:100%;max-width:430px;min-height:0;height:100vh;height:100dvh;margin-inline:auto;display:flex;flex-direction:column;overflow:hidden;overflow:clip;box-shadow:0 0 0 1px #606060,0 20px 100px #0008}
.chm-root>.chm-hud{flex:none;padding-top:env(safe-area-inset-top,0px)}
.chm-root>.chm-playfield{flex:1;min-height:0;width:100%;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#606060 transparent}
.chm-root .fixed.inset-0{overscroll-behavior:contain}
.chm-root .chm-rise{animation:chm-page-fade 150ms ease-out}
@keyframes chm-page-fade{from{opacity:.72;transform:translateY(3px)}to{opacity:1;transform:none}}
.chm-view-transition{view-transition-name:none}
.chm-view-transition .chm-playfield{view-transition-name:chimera-playfield}
::view-transition{pointer-events:none}
::view-transition-group(chimera-playfield){overflow:hidden;animation-duration:200ms}
::view-transition-old(chimera-playfield){animation:none;mix-blend-mode:normal}
::view-transition-new(chimera-playfield){animation:chm-page-reveal 200ms cubic-bezier(.22,.72,.25,1) both;mix-blend-mode:normal}
@keyframes chm-page-reveal{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.chm-bottom-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));flex:none;min-height:64px;padding:5px 6px calc(5px + env(safe-area-inset-bottom,0px));background:#000000;border-top:1px solid #606060;z-index:30}
.chm-bottom-nav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:52px;padding:5px 2px;color:#BDBDBD;font-size:10px;font-weight:600;letter-spacing:.02em;border-top:2px solid transparent}
.chm-bottom-nav a.on{color:var(--chm-yellow);background:#000000;border-top-color:var(--chm-yellow)}
.chm-toasts{bottom:calc(80px + env(safe-area-inset-bottom,0px));right:12px;max-width:calc(100% - 24px)}
.chm-mini-scene,.chm-judge-panel{bottom:calc(80px + env(safe-area-inset-bottom,0px));max-width:calc(100% - 24px)}
.chm-stage-location{max-width:100%;overflow-wrap:anywhere}
.chm-stage-confirmed{position:absolute;z-index:8;top:8px;left:8px;padding:5px 7px;border:1px solid var(--chm-black);background:var(--chm-yellow);color:var(--chm-black);font:700 10px 'Courier Prime',monospace}

.chm-arena-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.chm-arena-modes .chm-mode{justify-content:center;gap:5px;padding:6px 4px;font-size:11px}.chm-arena-modes .chm-mode>svg{width:14px;height:14px;flex:none}
.chm-specimen-roster button{min-height:52px}.chm-specimen-roster button svg{width:clamp(28px,9cqw,40px);height:clamp(28px,9cqw,40px)}.chm-specimen-roster .chm-roster-name b{font-size:clamp(10px,2.6cqw,11px)}
.chm-prep-champion>svg,.chm-prep-silhouette{max-width:100%}.chm-prep-champion>svg,.chm-prep-silhouette>svg{height:auto;max-width:100%}

.chm-menu{max-height:min(38rem,calc(100dvh - 128px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)));overscroll-behavior:contain}
.chm-wallet-panel{max-height:calc(100dvh - 148px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow-y:auto;overscroll-behavior:contain}

@container chimera (max-width:360px){.chm-specimen-roster button{padding:5px;gap:4px}.chm-specimen-roster{gap:6px}}

/* Zama Brand Kit: yellow / black / charcoal / light gray / white.
   World art and NFT trait palettes retain their own gameplay meaning. */
.chm-hud{background:var(--chm-yellow);color:var(--chm-black);border-bottom:2px solid var(--chm-black);box-shadow:none}
.chm-hud-brand{color:var(--chm-black)}
.chm-hud-control,.chm-hud .chm-hud-connect{background:transparent;color:var(--chm-black);border:1px solid #0008}
.chm-hud-control:hover,.chm-hud-control[aria-expanded="true"],.chm-hud-inbox[data-pending]{background:var(--chm-black);border-color:var(--chm-black);color:var(--chm-yellow)}
.chm-hud-count{background:var(--chm-white);color:var(--chm-black)}
.chm-hud :is(a,button):focus-visible{outline-color:var(--chm-black)}
.chm-hud .chm-menu{background:var(--chm-white);color:var(--chm-black);border-color:var(--chm-black);box-shadow:0 5px 0 var(--chm-yellow)}
.chm-menu .chm-nav a.on{background:var(--chm-yellow);color:var(--chm-black)}
.chm-playfield{background:var(--chm-white)}
.chm-playfield:has(.chm-overworld){background:var(--chm-white)}
.chm-world-title h1{color:var(--chm-black)}
.chm-world-title a{text-decoration-color:var(--chm-yellow);text-decoration-thickness:2px}
.chm-world-resources{background:var(--chm-black);border:1px solid #666;color:var(--chm-white)}
.chm-briefing{border:1px solid var(--chm-black);border-top:4px solid var(--chm-yellow);background:var(--chm-white);color:var(--chm-black);box-shadow:none}
.chm-briefing-head p{color:#606060}.chm-lumen-portrait{background:var(--chm-gray);border-color:#BDBDBD}
.chm-m-bld[data-guided]::after{content:'';position:absolute;inset:-3px;border:2px solid var(--chm-yellow);box-shadow:0 0 0 1px #181309,0 0 13px 3px #ffd209ad;pointer-events:none}
.chm-world-map .chm-m-bld[data-guided] .chm-m-plate{visibility:visible;background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-black)}
.chm-root .chm-quest-target:not(:disabled){box-shadow:0 0 0 2px var(--chm-black),0 0 0 4px var(--chm-yellow),0 0 14px 4px #ffd20966}
.chm-quest-target:where(fieldset){padding:4px}
.chm-world-board{border:1px solid var(--chm-yellow);box-shadow:none}
.chm-world-status{background:var(--chm-black);border-color:#606060;color:var(--chm-white)}
.chm-world-directory{background:var(--chm-black);color:var(--chm-white)}
.chm-world-directory button{background:var(--chm-charcoal);border:1px solid #666;color:var(--chm-white)}
.chm-world-disclosure{background:var(--chm-black);border:1px solid #666;color:var(--chm-white)}
.chm-world-judge[aria-pressed="false"]{background:var(--chm-white);color:var(--chm-black)}
.chm-bottom-nav{background:var(--chm-black);border-top:2px solid var(--chm-yellow)}
.chm-bottom-nav a{color:#BDBDBD}.chm-bottom-nav a.on{background:var(--chm-yellow);border-top-color:var(--chm-yellow);color:var(--chm-black)}
.chm-location,.chm-location.chm-location-file{background:var(--chm-yellow);color:var(--chm-black);border:1px solid var(--chm-black);border-left:4px solid var(--chm-black)}
.chm-location-art{filter:grayscale(1) brightness(0);opacity:.12}.chm-location-art::after{display:none}
.chm-location h1,.chm-location-file h1{color:var(--chm-black)}
.chm-location-status,.chm-location-status strong{color:var(--chm-charcoal)}
.chm-location-actions .chm-btn-primary,.chm-location-actions .chm-btn-gold{background:var(--chm-black);color:var(--chm-yellow);border-color:var(--chm-black)}
.chm-location-actions .chm-btn-ghost{background:transparent;color:var(--chm-black);border-color:var(--chm-black)}
.chm-panel.chm-specimen-portrait{background:radial-gradient(ellipse at 50% 46%,#3b3b3b,#2D2D2D 63%,#000000);border-color:#606060}
.chm-specimen-voice{background:var(--chm-black);border-left:3px solid var(--chm-yellow);color:var(--chm-white)}
.chm-arena-console,.chm-breed-console{background:var(--chm-white)}
.chm-specimen-roster button[aria-pressed="true"]{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-yellow)}
.chm-specimen-roster button[aria-pressed="true"] .chm-roster-name small{color:var(--chm-charcoal)}
.chm-roster-badge{background:var(--chm-black);color:var(--chm-yellow)}
.chm-battle-report{background:var(--chm-black)}
.chm-report-actions .chm-btn-ghost{color:var(--chm-white)}
.chm-chain-warning{background:var(--chm-charcoal);color:var(--chm-white);border-bottom:1px solid var(--chm-yellow)}
.chm-chain-warning button{color:var(--chm-yellow)}

.chm-location-art>svg:not(.chm-location-building){display:none}
.chm-stage-location{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-black)}
.chm-stage-dialog{background:var(--chm-white);border-color:var(--chm-black)}
.chm-stage-speaker{color:var(--chm-black)}.chm-stage-speaker[data-error="true"]{color:var(--chm-red)}
.chm-pip{background:var(--chm-charcoal);color:#BDBDBD;border-color:#606060}
.chm-pip-on{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-yellow)}
.chm-pip-done{background:var(--chm-gray);color:var(--chm-black);border-color:var(--chm-gray)}

/* Public opponent scouting; never a prediction of encrypted state. */
.chm-scout-trigger{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:44px;font-size:12px;font-weight:600;color:var(--chm-ink);border:1px solid var(--chm-line);background:var(--chm-panel2)}
.chm-scout-overlay{background:#0009}.chm-scout-drawer{display:flex;flex-direction:column;width:100%;height:100%;background:var(--chm-gray);color:var(--chm-black)}
.chm-scout-drawer>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:16px;background:var(--chm-yellow);border-bottom:1px solid var(--chm-black)}
.chm-scout-drawer>header span{font:10px 'Courier Prime',monospace;letter-spacing:.12em}.chm-scout-drawer>header h2{font:600 24px 'Space Grotesk',sans-serif}.chm-scout-drawer>header button{display:grid;place-items:center;min-width:44px;min-height:44px;border:1px solid #0005;background:transparent}
.chm-scout-content{min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px;display:flex;flex-direction:column;gap:16px;scrollbar-width:thin}
.chm-scout-profile{display:flex;align-items:center;gap:14px;padding:12px;background:var(--chm-black);color:var(--chm-white)}.chm-scout-profile>svg{flex:none}.chm-scout-profile>div{min-width:0}.chm-scout-profile h3{font:600 19px 'Space Grotesk',sans-serif;overflow-wrap:anywhere}.chm-scout-profile p{display:flex;gap:5px;align-items:center;margin-top:7px;font-size:11px;color:#BDBDBD}
.chm-scout-note{display:flex;align-items:start;gap:6px;font-size:12px;line-height:1.6;color:var(--chm-dim)}.chm-scout-note>svg{flex:none;margin-top:3px}.chm-scout-note:has(button){flex-wrap:wrap}
.chm-scout-empty{padding:24px 16px;text-align:center;background:var(--chm-white);border:1px solid var(--chm-line)}.chm-scout-empty>svg{margin:0 auto 12px}.chm-scout-empty h3{font-weight:600}.chm-scout-empty p{font-size:12px;line-height:1.6;margin-top:8px;color:var(--chm-dim)}
.chm-scout-record{display:grid;grid-template-columns:1fr 1fr;gap:12px}.chm-scout-record>b{display:grid;gap:3px;padding:14px 16px;background:var(--chm-white);border:1px solid var(--chm-line);font:600 30px 'Space Grotesk',sans-serif}.chm-scout-record small{font:11px 'Courier Prime',monospace;color:var(--chm-dim)}
.chm-scout-rounds,.chm-scout-replays{min-width:0}.chm-scout-rounds h3,.chm-scout-replays h3{font-size:12px;font-weight:600;margin-bottom:12px}.chm-scout-rounds>div{display:grid;grid-template-columns:25px minmax(0,1fr) 46px;gap:10px;align-items:center;margin-top:10px;font:12px 'Courier Prime',monospace}.chm-scout-rounds>div>i{display:block;height:9px;background:#ddd}.chm-scout-rounds>div>i>i{display:block;height:100%;background:var(--chm-yellow)}.chm-scout-rounds>div>b{text-align:right;font-weight:400}
.chm-scout-replays article{padding:10px 12px;border:1px solid var(--chm-line);background:var(--chm-white);margin-top:8px}.chm-scout-replays article>div{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.chm-scout-replays article>div>span{font-size:12px;overflow-wrap:anywhere}.chm-scout-replays article>div>button{display:flex;align-items:center;gap:4px;min-height:44px;padding:0 4px;font-size:12px}.chm-scout-replays article>div>b{font:600 19px 'Space Grotesk',sans-serif}.chm-scout-replays article small{font:10px 'Courier Prime',monospace;margin-left:5px}

/* Local planning tools sit behind one disclosure below the command queue. */
.chm-playbooks{margin:0 16px 16px;border-block:1px solid var(--chm-line);min-width:0}.chm-playbooks>summary{display:flex;align-items:center;gap:7px;min-height:46px;cursor:pointer;font-size:12px;font-weight:600;list-style:none}.chm-playbooks>summary::-webkit-details-marker{display:none}.chm-playbooks>summary>small{margin-left:auto;font:11px 'Courier Prime',monospace;color:var(--chm-dim)}.chm-playbooks>summary::after{content:'+';margin-left:5px;font-size:16px}.chm-playbooks[open]>summary::after{content:'−'}
.chm-playbook-content{padding:0 0 12px;display:flex;flex-direction:column;gap:12px}.chm-playbook-content>p{font-size:11px;line-height:1.6;color:var(--chm-dim)}
.chm-playbook-content ul{display:grid;gap:8px}.chm-playbook-content li{display:flex;align-items:center;justify-content:space-between;gap:5px;border:1px solid var(--chm-line);background:var(--chm-gray);padding:8px}.chm-playbook-content li[data-current="true"]{border-left:3px solid var(--chm-yellow)}.chm-playbook-content li>div:first-child{min-width:0;display:grid;gap:7px}.chm-playbook-content li b{font-size:12px;overflow-wrap:anywhere}.chm-playbook-queue{display:flex;gap:4px}.chm-playbook-queue>span{display:grid;place-items:center;width:24px;height:24px;border:1px solid #bbb;background:var(--chm-white)}.chm-playbook-content li>div:last-child{display:flex;align-items:center;gap:4px;flex:none}.chm-playbook-content li button{display:flex;align-items:center;justify-content:center;gap:4px;min-height:44px;min-width:44px;font-size:12px;background:var(--chm-white);border:1px solid var(--chm-line);padding:0 6px}
.chm-playbook-content form>label{display:block;font-size:12px;font-weight:600;margin-bottom:6px}.chm-playbook-content form>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.chm-playbook-content form>small{display:block;margin-top:6px;font-size:10px;color:var(--chm-dim)}.chm-playbook-content form .chm-btn{font-size:12px;padding-inline:10px}.chm-playbook-content form .chm-input{min-width:0}
.chm-playbook-status{font-size:11px;line-height:1.5;color:var(--chm-dim)}.chm-playbook-status:empty{display:none}.chm-playbook-error{font-size:12px;line-height:1.5;color:var(--chm-red)}.chm-playbook-error>button{min-height:44px;text-decoration:underline}


/* One local teaching run, with the same yellow / black control language. */
.chm-cipher-trial{min-width:0;border:1px solid var(--chm-black);background:var(--chm-white)}
.chm-trial-header{padding:18px 16px;background:var(--chm-yellow);color:var(--chm-black)}
.chm-trial-header>span{font:10px 'Courier Prime',monospace;letter-spacing:.12em}.chm-trial-header h2{font:600 27px/1.15 'Space Grotesk',sans-serif;letter-spacing:-.03em;margin-top:8px}
.chm-trial-header ol{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:16px}.chm-trial-header li{display:flex;align-items:center;gap:5px;font-size:11px;min-width:0}.chm-trial-header li>span{display:grid;place-items:center;width:22px;height:22px;border:1px solid #0007;flex:none}.chm-trial-header li[aria-current],.chm-trial-header li[data-done="true"]{font-weight:700}.chm-trial-header li[aria-current]>span,.chm-trial-header li[data-done="true"]>span{background:var(--chm-black);color:var(--chm-yellow)}
.chm-trial-body{padding:14px;display:grid;gap:14px;min-width:0}.chm-trial-boundary{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--chm-dim)}.chm-trial-boundary>svg{flex:none}.chm-trial-footnote{font-size:10px;line-height:1.6;color:var(--chm-dim);border-top:1px solid var(--chm-line);padding-top:10px}
.chm-trial-prep,.chm-trial-result{display:grid;gap:14px;min-width:0}.chm-trial-prep>p,.chm-trial-result>p{font-size:13px;line-height:1.6}.chm-trial-rival{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:10px;background:var(--chm-black);color:var(--chm-yellow)}.chm-trial-rival>div{display:grid;justify-items:center;gap:7px;min-width:0}.chm-trial-rival small{font:10px 'Courier Prime',monospace;color:#BDBDBD}.chm-trial-rival span{font-size:11px}
.chm-cipher-trial .chm-practice-stage{margin:0;box-shadow:none;width:100%;min-width:0;max-width:100%}
.chm-trial-live{padding:16px;background:var(--chm-black);color:var(--chm-yellow);font-size:13px;text-align:center;min-height:64px;align-content:center}.chm-trial-result h3{display:flex;align-items:center;gap:7px;font:600 21px/1.3 'Space Grotesk',sans-serif}
.chm-trial-rounds{display:grid;gap:7px}.chm-trial-rounds li{display:flex;align-items:center;gap:10px;padding:10px;background:var(--chm-gray);border:1px solid var(--chm-line);font-size:12px}.chm-trial-rounds li>span{font:11px 'Courier Prime',monospace}.chm-trial-rounds li>div{display:grid;gap:4px;min-width:0}.chm-trial-rounds small{font-size:11px;color:var(--chm-dim)}.chm-trial-rounds strong{margin-left:auto;font-size:11px;padding:4px 7px;background:var(--chm-charcoal);color:var(--chm-white)}.chm-trial-rounds strong[data-won="true"]{background:var(--chm-yellow);color:var(--chm-black)}
.chm-trial-math,.chm-trial-history{border-block:1px solid var(--chm-line)}.chm-trial-math summary,.chm-trial-history summary{min-height:44px;align-content:center;font-size:12px;cursor:pointer;font-weight:600}.chm-trial-math>div{display:grid;gap:5px;font:11px/1.5 'Courier Prime',monospace;padding:8px;border-top:1px solid var(--chm-line)}.chm-trial-math>p,.chm-trial-history>p{font-size:11px;line-height:1.6;color:var(--chm-dim);margin-bottom:10px}.chm-trial-history>div{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;padding:8px 0;border-top:1px solid var(--chm-line)}
.chm-trial-tally{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.chm-trial-tally li{display:grid;gap:6px;padding:12px 6px;text-align:center;background:var(--chm-black);color:var(--chm-yellow)}.chm-trial-tally span{font-size:11px}.chm-trial-tally b{font:600 26px 'Space Grotesk',sans-serif}.chm-trial-link{display:flex;align-items:center;justify-content:center;min-height:44px;font-size:12px;font-weight:600;text-decoration:underline;text-underline-offset:4px}
@container chimera (max-width:360px){.chm-trial-body{padding:10px}.chm-trial-header{padding:16px 12px}.chm-trial-header li{font-size:10px}.chm-trial-header li>span{width:20px;height:20px}}
@media (max-height:640px){
  .chm-cipher-trial[data-starter] .chm-trial-header{padding-block:10px}
  .chm-cipher-trial[data-starter] .chm-trial-header ol{margin-top:8px}
  .chm-cipher-trial[data-starter] .chm-trial-body{gap:10px}
  .chm-cipher-trial[data-starter] .chm-practice-stage{min-height:142px}
}

/* Trait goals use bounds from permitted knowledge, never an invented hidden gene. */
.chm-breeding-objective{min-width:0;padding-block:14px;margin-bottom:16px;border-block:1px solid var(--chm-line)}.chm-breeding-objective h3{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;margin-bottom:12px}.chm-goal-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.chm-goal-controls label{display:grid;gap:5px;font-size:11px;color:var(--chm-dim)}.chm-goal-controls select{width:100%;min-width:0;min-height:44px;font-size:16px;background:var(--chm-gray);color:var(--chm-black);border:1px solid var(--chm-line);padding:6px}.chm-goal-controls>div{display:flex;gap:4px}.chm-goal-controls button{min-height:44px;padding:6px 8px;font-size:11px;border:1px solid var(--chm-line);background:var(--chm-gray)}.chm-goal-controls button[aria-pressed="true"]{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-black)}
.chm-goal-odds{display:grid;gap:5px;margin-top:14px}.chm-goal-odds>span{font-size:12px}.chm-goal-odds>b{font:600 30px 'Space Grotesk',sans-serif}.chm-goal-odds>small{font-size:10px;color:var(--chm-dim)}.chm-goal-range{position:relative;height:8px;background:var(--chm-gray);margin-top:10px}.chm-goal-range>*{position:absolute;inset:0 auto 0 0}.chm-goal-range>i{background:var(--chm-yellow)}.chm-goal-range>b{background:var(--chm-black)}.chm-breeding-objective>p{display:flex;align-items:start;gap:5px;margin-top:10px;font-size:11px;line-height:1.6;color:var(--chm-dim)}.chm-breeding-objective>p>svg{flex:none;margin-top:3px}.chm-goal-swap{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:11px}.chm-goal-inspect{display:inline-flex;min-height:44px;align-items:center;margin-right:12px;font-size:11px;text-decoration:underline;text-underline-offset:3px}

/* Campaign acts turn verified ownership / lineage into the next playable objective. */
.chm-campaign{min-width:0;background:var(--chm-white);border:1px solid var(--chm-black)}.chm-campaign>nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--chm-line);border-bottom:1px solid var(--chm-black)}.chm-campaign>nav button{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:5px;min-height:60px;padding:8px 4px;background:var(--chm-gray);color:var(--chm-dim);font-size:11px}.chm-campaign>nav button[aria-pressed="true"]{background:var(--chm-yellow);color:var(--chm-black)}.chm-campaign>nav small{font:10px 'Courier Prime',monospace}.chm-campaign-scene{position:relative;isolation:isolate;overflow:hidden;min-height:235px;background:var(--chm-black)}.chm-campaign-scene>svg{z-index:-2}.chm-campaign-scene::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,#000 0%,#0004 65%)}.chm-campaign-actors{position:absolute;inset:20px 28px 78px;display:flex;align-items:end;justify-content:space-around;gap:12px}.chm-campaign-actors>div{width:50px;flex:none}.chm-campaign-actors>svg{max-width:55%;height:auto;max-height:135px}.chm-campaign-title{position:absolute;inset:auto 16px 16px;color:var(--chm-white)}.chm-campaign-title>span{font:10px 'Courier Prime',monospace;color:var(--chm-yellow)}.chm-campaign-title h2{font:600 26px/1.2 'Space Grotesk',sans-serif;margin-top:5px;letter-spacing:-.03em}.chm-campaign-body{display:grid;gap:16px;padding:16px;min-width:0}.chm-campaign-body>p{font-size:13px;line-height:1.7}.chm-campaign-body>p>b{display:block;font:10px 'Courier Prime',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--chm-dim);margin-bottom:6px}.chm-campaign-body ol{display:grid;gap:8px}.chm-campaign-body li{display:flex;align-items:center;gap:9px;min-width:0;padding:12px 8px;background:var(--chm-gray);border:1px solid var(--chm-line)}.chm-campaign-body li>span{display:grid;place-items:center;width:26px;height:26px;border:1px solid var(--chm-line);flex:none}.chm-campaign-body li[data-done="true"]>span{background:var(--chm-yellow);color:var(--chm-black);border-color:var(--chm-black)}.chm-campaign-body li>div{display:grid;gap:4px;min-width:0}.chm-campaign-body li b{font-size:12px}.chm-campaign-body li small{font-size:10px;line-height:1.5;color:var(--chm-dim)}.chm-campaign-proof{margin-left:auto;display:inline-flex;align-items:center;min-height:44px;font-size:11px;font-weight:600;text-decoration:underline}.chm-campaign-note a{text-decoration:underline;text-underline-offset:3px}.chm-campaign-note{font-size:10px;line-height:1.7;color:var(--chm-dim)}
`
