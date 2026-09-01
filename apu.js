'use strict';

/* ===================== Vakiot ===================== */
// Laskentavakiot ja -ydin (simulate, ratkaisijat, MC): laskenta.js —
// ladataan ennen tätä tiedostoa ja jaetaan mc-workerin kanssa.

// loan: oletusrahoitus lainalla { share: käsirahan osuus, rate: %/v, years: laina-aika }
const CONSUMER_LOAN = { share: 0.3, rate: 8.0, years: 5 };
const EVENT_TYPES = {
  study:       { icon: '🎓', label: 'Opiskelu',            amount: -15000,  loan: { share: 0,    rate: 1.0, years: 10 }, defaultFin: 'loan' },
  home:        { icon: '🏠', label: 'Asunnon osto',        amount: -220000, loan: { share: 0.15, rate: 3.5, years: 25 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  car:         { icon: '🚗', label: 'Auton osto',          amount: -25000,  loan: { share: 0.2,  rate: 4.5, years: 6 },  defaultFin: 'loan', asset: { appr: -10.0 } },
  wedding:     { icon: '💍', label: 'Häät',                amount: -20000,  loan: CONSUMER_LOAN, defaultFin: 'cash' },
  child:       { icon: '👶', label: 'Lapsi',               amount: -3000,   loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -300, years: 18 } },
  // Ero tai muu suuri elämänmuutos: kertakulu (ositus, muutto, uusi koti) +
  // toistuva kulunlisäys (yksin asuminen, elatus) — molemmat säädettävissä
  divorce:     { icon: '💔', label: 'Ero / iso muutos',    amount: -20000,  loan: { share: 0.2,  rate: 4.5, years: 10 }, defaultFin: 'cash', rec: { monthly: -300, years: 5 } },
  renovation:  { icon: '🛠️', label: 'Remontti',            amount: -30000,  loan: { share: 0.1,  rate: 4.5, years: 10 }, defaultFin: 'loan' },
  travel:      { icon: '✈️', label: 'Unelmamatka',         amount: -8000,   loan: CONSUMER_LOAN, defaultFin: 'cash' },
  recurring:   { icon: '💳', label: 'Kuukausimeno',        amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -200, years: 10 } },
  // Tulokatko: työttömyys, perhevapaa, osa-aika, sapatti — säästö katkeaa
  // (tai pienenee) määräajaksi. Sama laskenta kuin Kuukausimenolla; oma tyyppi,
  // jotta katko saa nimen, ikonin ja Tulkin haasta-tehtävä osaa käyttää sitä
  // (auditointi 8/2026: aiemmin kierrettiin "monthly pienemmäksi").
  income_gap:  { icon: '⏸️', label: 'Tulokatko',           amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -600, years: 1 } },
  sidegig:     { icon: '💼', label: 'Sivutulo',            amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: 300, years: 10 } },
  cottage:     { icon: '🏡', label: 'Mökki / vene',        amount: -120000, loan: { share: 0.25, rate: 4.0, years: 15 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  // Omistukset: nykytila alkuehtona — ei ostohetken kassavirtaa, vain jäljellä
  // oleva laina hoitoerineen (OMISTUKSET.md). own = lainaoletukset, amount = −nykyarvo.
  ownHome:     { icon: '🔑', label: 'Oma asunto',          amount: -250000, owned: true, asset: { appr: 2.0 }, own: { loanLeft: 120000, rate: 3.5, years: 18 } },
  ownFlat:     { icon: '🏢', label: 'Sijoitusasunto',      amount: -180000, owned: true, asset: { appr: 2.0 }, own: { loanLeft: 100000, rate: 3.5, years: 15 }, rec: { monthly: 650, years: 30 } },
  ownCottage:  { icon: '🌲', label: 'Oma mökki / vene',    amount: -120000, owned: true, asset: { appr: 2.0 }, own: { loanLeft: 40000, rate: 4.0, years: 10 } },
  inheritance: { icon: '💎', label: 'Perintö / lahja',     amount: 60000 },
  bonus:       { icon: '💰', label: 'Bonus / myyntivoitto', amount: 20000 },
  // Tavoitepiste on mittari, ei kassavirta (metric): simulaattori ohittaa sen,
  // graafi näyttää vajeet ja MC-ylitysosuuden, Ratkaise hakee säästön
  goal:        { icon: '🎯', label: 'Tavoite',             amount: 100000, metric: true },
  // Siirrot puolisolle/puolisolta: näkyvät vain perhetilassa ja pysyvät
  // pareina synkassa molempien suunnitelmissa (linkId)
  transferOut: { icon: '📤', label: 'Siirto läheiselle',   amount: -5000, familyOnly: true },
  transferIn:  { icon: '📥', label: 'Siirto läheiseltä',   amount: 5000,  familyOnly: true },
  retirement:  { icon: '🌴', label: 'Eläkkeelle jäänti',   withdrawal: 2400, pension: 1500, pensionAge: 65, unique: true },
};

/* Kysymyskirjasto: yhden napautuksen lavastukset NYKYISEEN suunnitelmaan
   (ei korvaa sitä kuten Esimerkit). Moottori osaa kaiken jo — tämä on
   sisäänkäynti (strategia: parannussuunta #2; imaisu-ohjelma A4: mitattu
   pullonkaula on oman tapahtuman lisääminen). Operaatiot ovat deklaratiivisia,
   jotta sama luettelo syöttää myös hakuaikeiden laskeutumissivut
   (tyokalut/laskeutumissivut.js rakentaa niistä #s=-esimerkkilinkit):
   - retAge: eläkeikä · goal: 'manual'|'age'|'saving'|'withdrawal' · conf: varmuustaso
   - withdrawal: tulotarve €/kk · event: { type, dAge (vuosia nykyhetkestä), ...kentät }
   dMonthly: recMonthly = −kuukausisäästö (tulokatko syö säästön). */
const KYSYMYKSET = [
  { id: 'elake60', q: 'Onko minulla varaa eläkkeelle 60-vuotiaana?', desc: 'Eläkeikä 60 — katso onnistumis-% ja mitä sijoituksista pitää nostaa',
    ops: { retAge: 60, goal: 'manual' } },
  { id: 'aikaisin85', q: 'Kuinka aikaisin voin lopettaa työt 85 % varmuudella?', desc: 'Ratkaisija hakee aikaisimman eläkeiän nykyisellä tulotarpeella',
    ops: { goal: 'age', conf: 0.85 } },
  { id: 'saasto65', q: 'Paljonko pitää säästää, jotta eläke riittää 65-vuotiaana?', desc: 'Ratkaisija hakee kuukausisäästön nykyiselle tulotarpeelle',
    ops: { retAge: 65, goal: 'saving' } },
  { id: 'asunto5', q: 'Mitä jos ostan asunnon viiden vuoden päästä?', desc: 'Asunnon osto lainalla, oletushinta — säädä popoverista',
    ops: { event: { type: 'home', dAge: 5 } } },
  { id: 'tyoton1', q: 'Mitä jos jään vuodeksi työttömäksi?', desc: 'Tulokatko: kuukausisäästö katkeaa 12 kuukaudeksi kahden vuoden päästä',
    ops: { event: { type: 'income_gap', dAge: 2, dMonthly: true, recYears: 1 } } },
  { id: 'lapsi', q: 'Mitä lapsi tekee polulleni?', desc: 'Lapsi kolmen vuoden päästä: kertakulu + 300 €/kk 18 vuotta',
    ops: { event: { type: 'child', dAge: 3 } } },
  { id: 'perinto50', q: 'Entä jos saan 50 000 € perinnön?', desc: 'Kertasumma kymmenen vuoden päästä',
    ops: { event: { type: 'inheritance', dAge: 10, amount: 50000 } } },
  { id: 'tulo3000', q: 'Riittävätkö varani 3 000 €/kk eläkkeellä?', desc: 'Kuukausitulon tarve 3 000 € — katso riittävyys ja ehtymisikä',
    ops: { withdrawal: 3000, goal: 'manual' } },
];

function initLoanFields(ev) {
  const def = EVENT_TYPES[ev.type].loan || CONSUMER_LOAN;
  const price = Math.max(0, -ev.amount);
  if (ev.down == null) ev.down = Math.round(price * def.share);
  if (ev.rate == null) ev.rate = def.rate;
  if (ev.years == null) ev.years = def.years;
}

let idSeq = 1;

const state = {
  ageNow: 30,
  ageEnd: 90,
  startCapital: 20000,
  monthly: 1000,
  savingsGrowth: 1.5, // säästön vuosikasvu % (palkkakehitys)
  savePhases: null,   // porrastettu säästö [{to, amount}] tai null = tasainen
  allocStocks: 70,
  allocBonds: 20,
  glide: false,
  real: false,
  inflation: 2,       // inflaatio-oletus %/v (käytössä kun real=true; 2 % = ennallaan)
  tax: true,          // myyntivoittovero nostoissa (oletuksena päällä uusille)
  acct: 'aot',        // sijoitustili: aot | ost (osakesäästötili) | ins (vakuutuskuori)
  feePct: 0,          // sijoituskulut %/v (rahastojen TER, kaupankäynti)
  wrapFee: 0,         // vakuutuskuoren vuosikulu %/v (vain acct 'ins')
  divYield: 0,        // suorien osakkeiden osinkotuotto %/v (0 = kasvurahastot)
  proOn: false,       // Pro-tila: ammattilaissäädöt (laskenta.js/proOf)
  pro: null,
  income: null,       // Säästökyky-apuri: nettotulot €/kk (valinnainen)
  expenses: null,     // ja menot €/kk — eläketarpeen oletus ja säästöaste
  events: [
    { id: idSeq++, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
    { id: idSeq++, type: 'car',  age: 45, amount: -25000,  financing: 'loan', down: 5000,  rate: 4.5, years: 6,  isAsset: true, appr: -10.0 },
    { id: idSeq++, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
  ],
};

/* ===================== Apurit ===================== */

const $ = (id) => document.getElementById(id);

// Muotoiluapurit (fmtEur, fmtCompact, pctFmt, fmtAge, fmtLuku, fmtPvm): kieli.js —
// ladataan ennen tätä tiedostoa; locale-sidonnainen muotoilu vain siellä.

const NAME_MAX = 40;
// Tapahtuman näyttönimi: oma nimi tai tyypin oletusnimi
const evLabel = (ev) => (ev.name && ev.name.trim()) || t(EVENT_TYPES[ev.type].label);

// Eläketapahtuman tavoitetila: manual | withdrawal | age | saving
const retGoal = (ev) => ev.goal || 'manual';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===================== Anonyymi datalahjoitus: paketti ===================== */
// Lahjoituspaketti rakennetaan alusta tiukalla whitelistillä — tapahtumien
// omat nimet tai muut henkilökohtaiset kentät eivät voi päätyä mukaan.
// Summat pyöristetään kahteen merkitsevään numeroon.

const DATA_API = 'https://varallisuuspolku-data.up.railway.app';

function buildDonationPayload(st, s) {
  const events = [];
  for (const e of [...st.events].sort((a, b) => a.age - b.age)) {
    // Perheen sisäiset siirrot eivät kuulu vertailudataan
    if (EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly) continue;
    if (e.type === 'retirement') {
      const ev = {
        type: 'retirement', age: Math.round(e.age),
        withdrawal: round2sig(e.withdrawal || 0),
        pension: round2sig(e.pension || 0),
      };
      if (e.pensionAge != null) ev.pensionAge = Math.round(e.pensionAge);
      if (e.goal) ev.goal = e.goal;
      if (e.conf != null) ev.conf = e.conf;
      events.push(ev);
    } else {
      const ev = { type: e.type, age: Math.round(e.age) };
      if (e.amount) ev.amount = round2sig(e.amount);
      if (e.financing === 'loan') {
        ev.financing = 'loan';
        if (e.down != null) ev.down = round2sig(e.down);
        if (e.rate != null) ev.rate = Math.round(e.rate * 10) / 10;
        if (e.years != null) ev.years = Math.round(e.years);
      }
      if (e.isAsset) {
        ev.isAsset = true;
        if (e.appr != null) ev.appr = Math.round(e.appr * 10) / 10;
        if (e.sellAge != null) { ev.sellAge = Math.round(e.sellAge); ev.sellTaxFree = !!e.sellTaxFree; }
      }
      // Omistus: nykytila-kentät (ei ostovuotta — ei tarpeen aggregaateille)
      if (e.owned) {
        ev.owned = true;
        if ((e.loanLeft || 0) > 0) {
          ev.loanLeft = round2sig(e.loanLeft);
          if (e.rate != null) ev.rate = Math.round(e.rate * 10) / 10;
          if (e.years != null) ev.years = Math.round(e.years);
        }
      }
      if (e.recMonthly) {
        ev.recMonthly = round2sig(e.recMonthly);
        ev.recYears = Math.round(clamp(e.recYears || 10, 1, 60));
      }
      events.push(ev);
    }
  }
  const payload = {
    v: 1,
    ageNow: Math.round(st.ageNow), ageEnd: Math.round(st.ageEnd),
    startCapital: round2sig(st.startCapital),
    monthly: round2sig(st.monthly),
    savingsGrowth: Math.round((st.savingsGrowth || 0) * 10) / 10,
    alloc: { stocks: Math.round(st.allocStocks), bonds: Math.round(st.allocBonds) },
    glide: !!st.glide, real: !!st.real, tax: !!st.tax,
    events,
  };
  // Sijoitustili ja kokonaiskulut mukaan vertailuun (ei oletusarvoja turhaan)
  if (st.acct === 'ost' || st.acct === 'ins') payload.acct = st.acct;
  const feeTot = (st.feePct || 0) + (st.acct === 'ins' ? st.wrapFee || 0 : 0);
  if (feeTot > 0) payload.feePct = Math.round(feeTot * 100) / 100;
  if (s) {
    payload.derived = { wEnd: round2sig(Math.max(0, s.wEnd)) };
    if (s.wAtRet != null) payload.derived.wAtRet = round2sig(Math.max(0, s.wAtRet));
    if (s.successProb != null) payload.derived.successProb = Math.round(s.successProb * 100) / 100;
    if (s.retireAge != null) payload.derived.retireAge = Math.round(s.retireAge * 10) / 10;
    if (s.taxPaid > 0) payload.derived.taxPaid = round2sig(s.taxPaid);
  }
  return payload;
}

// Plausible-ydintapahtumat: piirtopöytä avattu, veto tehty, jakolinkki
// luotu, vertailujako. Vain tapahtuman nimi (+ vedon tyyppi) — ei sisältöä,
// ei tunnisteita. Goalit lisätään Plausible-hallinnassa samoilla nimillä.
function track(name, props) {
  try {
    if (window.plausible) window.plausible(name, props ? { props } : undefined);
  } catch (e) { /* analytiikka ei saa koskaan haitata käyttöä */ }
}

// Kerran istunnossa: usein toistuvat eleet (vedot) eivät paisuta tapahtumamäärää —
// Plausiblen uniques-luku on joka tapauksessa suppilon mittari
const trackedOnce = new Set();
function trackOnce(name, props) {
  if (trackedOnce.has(name)) return;
  trackedOnce.add(name);
  track(name, props);
}

// djb2 — kevyt tiiviste "sama suunnitelma jo lahjoitettu" -muistiin
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ===================== Laskenta ja MC-tarkennus ===================== */
// simulate(), runPath ja ratkaisijat: laskenta.js. Tässä worker-asiakas, joka
// tarkentaa onnistumis-%:n, viuhkan ja tavoiteosuudet MC_FULL-polkumäärällä
// irrotuksen jälkeen (periaate: deterministinen per frame, stokastinen
// irrotettaessa). Ilman Workeria jäädään MC_LIVE-tarkkuuteen — kaikki toimii,
// luvut ovat vain karkeampia.

let mcWorker = null, mcSeq = 0, mcTimer = null;
let ghostMc = null; // haamun tarkennus samalla polkumäärällä — deltat reiluja

// Tavoitepisteet MC:lle: osuus poluista, joilla varallisuus ylittää pisteen
function simGoals() {
  const gs = state.events.filter((e) => e.type === 'goal');
  return gs.length ? gs.map((g) => ({ id: g.id, age: g.age, value: g.amount })) : null;
}

function initMcWorker() {
  if (typeof Worker === 'undefined') return;
  try {
    mcWorker = new Worker('mc-worker.js');
  } catch (e) { mcWorker = null; return; }
  mcWorker.addEventListener('error', () => { mcWorker = null; });
  mcWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (d.task === 'solveGoals') { onSolveGoalsMsg(d); return; }
    if (d.task === 'mcJoint') {
      if (d.ok && d.seq === mcSeq) { jointMc = d; renderStats(); }
      return;
    }
    if (!d.ok || d.task !== 'mc') return;
    if (d.kind === 'ghost') {
      if (ghostSim && d.months === ghostSim.months) {
        ghostMc = d;
        updateHud();
        renderStats(); // deltat samalla polkumäärällä myös kojelaudan kortteihin
      }
      return;
    }
    // Vanhentunut vastaus (tila ehti muuttua) hylätään. Kesken raahauksen
    // tulos hylätään myös — muuten viuhkan päivitys skaalaisi koordinaatiston
    // uusiksi sormen alla; tuore pyyntö lähtee joka tapauksessa irrotuksessa.
    if (d.seq !== mcSeq || !sim || d.months !== sim.months) return;
    if (dragLight || drawState.drag) return;
    sim.successProb = d.successProb;
    sim.successStale = false;
    sim.opt = d.p90;
    sim.pess = d.p10;
    sim.goalShares = d.goalShares;
    sim.mcPaths = d.paths;
    sim.ruinCurve = d.ruin;
    sim.pctLo = d.pctLo;
    sim.pctHi = d.pctHi;
    lastFullSim = sim;
    renderChart(true);
    renderStats();
    updateHud();
    if (state.proOn) scheduleProAna();
  });
}

function requestMcRefresh() {
  if (!mcWorker || !sim) return;
  clearTimeout(mcTimer);
  const snapshot = serialize();
  const wd = sim.withdrawal, ra = sim.retireAge;
  mcTimer = setTimeout(() => {
    mcSeq++;
    const pCur = proOf(state);
    mcWorker.postMessage({
      task: 'mc', kind: 'cur', seq: mcSeq, st: snapshot,
      paths: pCur ? pCur.mc.paths : MC_FULL, withdrawal: wd, retireAge: ra, goals: simGoals(),
    });
    if (baseline && ghostSim && !ghostMc) {
      const pG = proOf(baseline);
      mcWorker.postMessage({
        task: 'mc', kind: 'ghost', seq: mcSeq, st: JSON.parse(JSON.stringify(baseline)),
        paths: pG ? pG.mc.paths : MC_FULL, withdrawal: ghostSim.withdrawal, retireAge: ghostSim.retireAge,
      });
    }
    if (familyOn()) {
      // Perheen yhteinen MC: kaikki henkilöt samaan maailmaan
      saveActiveIntoFamily();
      mcWorker.postMessage({
        task: 'mcJoint', seq: mcSeq,
        states: family.persons.map((p) => JSON.parse(JSON.stringify(p.data))),
        paths: pCur ? pCur.mc.paths : MC_FULL,
      });
    }
  }, 200);
}

// HUD (V1) ja tavoiteratkaisu (V3) — määritellään myöhemmissä osioissa;
// stubit pitävät worker-käsittelijän eheänä.
let updateHud = () => {};
let onSolveGoalsMsg = () => {};

