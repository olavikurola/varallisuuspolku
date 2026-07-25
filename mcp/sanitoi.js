'use strict';

/* Varallisuuspolku MCP — suunnitelma-JSON:n purku ja sanitointi.

   Peilaa app.js:n applySaved-validoinnin (DOM-sidonnainen, ei käytettävissä
   Nodessa) ja jakolinkin base64-purun. Tietoiset poikkeamat applySavedista:
   - events on PAKOLLINEN taulukko (applySaved jättäisi sovelluksen
     oletustapahtumat voimaan — agentin suunnitelmaan ei saa ilmestyä
     220 000 €:n asuntoa hiljaa)
   - ageNow/ageEnd/startCapital/monthly pakollisia samasta syystä;
     allocStocks/allocBonds saavat oletuksen 70/20 (dokumentoitu skeemassa)
   - tapahtumia enintään 40 (sama katto kuin palvelimen whitelistissä)
   Virheet ovat suomeksi ja kertovat mikä kenttä ja miksi — agentti osaa
   korjata syötteen niiden perusteella. */

const NAME_MAX = 40;
const EVENTS_MAX = 40;
const CONSUMER_LOAN = { share: 0.3, rate: 8.0, years: 5 };

// Tapahtumatyypit ja oletukset — sama sisältö kuin app.js:n EVENT_TYPES
// (ilman ikoneita). Skeematyökalu dokumentoi nämä agenteille.
const EVENT_TYPES = {
  study:       { label: 'Opiskelu',             amount: -15000,  loan: { share: 0,    rate: 1.0, years: 10 }, defaultFin: 'loan' },
  home:        { label: 'Asunnon osto',         amount: -220000, loan: { share: 0.15, rate: 3.5, years: 25 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  car:         { label: 'Auton osto',           amount: -25000,  loan: { share: 0.2,  rate: 4.5, years: 6 },  defaultFin: 'loan', asset: { appr: -10.0 } },
  wedding:     { label: 'Häät',                 amount: -20000,  loan: CONSUMER_LOAN, defaultFin: 'cash' },
  child:       { label: 'Lapsi',                amount: -3000,   loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -300, years: 18 } },
  renovation:  { label: 'Remontti',             amount: -30000,  loan: { share: 0.1,  rate: 4.5, years: 10 }, defaultFin: 'loan' },
  travel:      { label: 'Unelmamatka',          amount: -8000,   loan: CONSUMER_LOAN, defaultFin: 'cash' },
  recurring:   { label: 'Kuukausimeno',         amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -200, years: 10 } },
  sidegig:     { label: 'Sivutulo',             amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: 300, years: 10 } },
  cottage:     { label: 'Mökki / vene',         amount: -120000, loan: { share: 0.25, rate: 4.0, years: 15 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  ownHome:     { label: 'Oma asunto (omistan jo)',     amount: -250000, owned: true, asset: { appr: 2.0 }, own: { loanLeft: 120000, rate: 3.5, years: 18 } },
  ownFlat:     { label: 'Sijoitusasunto (omistan jo)', amount: -180000, owned: true, asset: { appr: 2.0 }, own: { loanLeft: 100000, rate: 3.5, years: 15 }, rec: { monthly: 650, years: 30 } },
  ownCottage:  { label: 'Oma mökki / vene (omistan jo)', amount: -120000, owned: true, asset: { appr: 2.0 }, own: { loanLeft: 40000, rate: 4.0, years: 10 } },
  inheritance: { label: 'Perintö / lahja',      amount: 60000 },
  bonus:       { label: 'Bonus / myyntivoitto', amount: 20000 },
  goal:        { label: 'Varallisuustavoite',   amount: 100000, metric: true },
  transferOut: { label: 'Siirto läheiselle',    amount: -5000, familyOnly: true },
  transferIn:  { label: 'Siirto läheiseltä',    amount: 5000,  familyOnly: true },
  retirement:  { label: 'Eläkkeelle jäänti',    withdrawal: 2400, pension: 1500, pensionAge: 65, unique: true },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const numOk = (v) => typeof v === 'number' && isFinite(v);

class SuunnitelmaVirhe extends Error {}

function virhe(msg) { throw new SuunnitelmaVirhe(msg); }

/* Jakolinkin purku: hyväksyy suoran objektin, JSON-merkkijonon, koko URL:n,
   #s=…-hashin tai paljaan base64:n. Selain koodaa btoa(unescape(
   encodeURIComponent(json))) = utf8→base64, jonka Buffer purkaa suoraan. */
function puraSuunnitelma(input) {
  if (input && typeof input === 'object') return input;
  if (typeof input !== 'string' || !input.trim()) {
    virhe('suunnitelma puuttuu: anna jakolinkki (varallisuuspolku.com#s=…) tai suunnitelma-JSON-objekti.');
  }
  const s = input.trim();
  if (s.includes('#f=')) {
    virhe('Tämä on perhelinkki (#f=) — käytä simuloi_perhe-työkalua, joka laskee koko kotitalouden.');
  }
  let b64 = null;
  const hash = s.indexOf('#s=');
  if (hash >= 0) b64 = s.slice(hash + 3);
  else if (s.startsWith('{')) {
    try { return JSON.parse(s); }
    catch (e) { virhe('Suunnitelma-JSON ei jäsenny: ' + e.message); }
  } else b64 = s;
  let json;
  try { json = Buffer.from(b64, 'base64').toString('utf8'); }
  catch (e) { virhe('Jakolinkin base64-osa ei purkaudu.'); }
  try { return JSON.parse(json); }
  catch (e) { virhe('Jakolinkki ei sisällä kelvollista suunnitelmaa (JSON ei jäsenny). Tarkista että linkki kopioitui kokonaan.'); }
}

/* Rakentaa puhtaan simulate()-yhteensopivan tilan tai heittää
   SuunnitelmaVirheen. Sama järjestys ja samat clampit kuin applySavedissa. */
function sanitoiSuunnitelma(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    virhe('suunnitelman pitää olla JSON-objekti.');
  }
  if (data.persons || data.active !== undefined) {
    virhe('Tämä näyttää perhesuunnitelmalta — perhetila ei ole vielä tuettu MCP:ssä.');
  }
  for (const k of ['ageNow', 'ageEnd', 'startCapital', 'monthly']) {
    if (!numOk(data[k])) virhe(`kenttä "${k}" puuttuu tai ei ole luku — pakolliset kentät: ageNow, ageEnd, startCapital, monthly, events. Kutsu suunnitelman_skeema saadaksesi koko skeeman.`);
  }
  if (!Array.isArray(data.events)) {
    virhe('kenttä "events" puuttuu tai ei ole taulukko. Tyhjä taulukko [] käy; eläkelaskentaan lisää {type:"retirement", age:65, withdrawal:2400, pension:1500, pensionAge:65}.');
  }
  if (data.events.length > EVENTS_MAX) virhe(`tapahtumia enintään ${EVENTS_MAX}.`);

  const st = {
    ageNow: clamp(Math.round(data.ageNow), 0, 105),
    ageEnd: clamp(Math.round(data.ageEnd), 2, 105),
    startCapital: clamp(data.startCapital, 0, 1e9),
    monthly: clamp(data.monthly, 0, 1e6),
    allocStocks: numOk(data.allocStocks) ? clamp(Math.round(data.allocStocks), 0, 100) : 70,
    allocBonds: numOk(data.allocBonds) ? clamp(Math.round(data.allocBonds), 0, 100) : 20,
    glide: !!data.glide,
    real: !!data.real,
    tax: !!data.tax,
    inflation: numOk(data.inflation) ? clamp(data.inflation, 0, 15) : 2,
    savingsGrowth: numOk(data.savingsGrowth) ? clamp(data.savingsGrowth, 0, 15) : 0,
    savePhases: null,
    proOn: !!data.proOn,
    pro: data.pro && typeof data.pro === 'object' ? data.pro : null,
    income: numOk(data.income) ? clamp(data.income, 0, 1e6) : null,
    expenses: numOk(data.expenses) ? clamp(data.expenses, 0, 1e6) : null,
    acct: data.acct === 'ost' || data.acct === 'ins' ? data.acct : 'aot',
    feePct: numOk(data.feePct) ? clamp(data.feePct, 0, 10) : 0,
    wrapFee: numOk(data.wrapFee) ? clamp(data.wrapFee, 0, 10) : 0,
    divYield: numOk(data.divYield) ? clamp(data.divYield, 0, 10) : 0,
    events: [],
  };
  if (st.allocStocks + st.allocBonds > 100) st.allocBonds = 100 - st.allocStocks;
  // Pro päällä: moottori käyttää pro.infl:iä — peruskenttä näyttää saman (yksi totuus)
  if (st.proOn && st.pro && numOk(st.pro.infl)) st.inflation = clamp(st.pro.infl, 0, 15);
  if (st.ageEnd <= st.ageNow + 1) st.ageEnd = st.ageNow + 2;

  if (Array.isArray(data.savePhases) && data.savePhases.length) {
    const ph = data.savePhases
      .filter((r) => r && numOk(r.to) && numOk(r.amount))
      .map((r) => ({ to: clamp(Math.round(r.to), 1, 105), amount: clamp(r.amount, 0, 1e6) }))
      .sort((a, b) => a.to - b.to)
      .slice(0, 8);
    st.savePhases = ph.length ? ph : null;
  }

  // Tapahtumat: tuntematon tyyppi ja ikävirheet kerrotaan (applySaved pudottaa
  // hiljaa — agentille äänetön pudotus näyttäisi laskuvirheeltä)
  let id = 1000;
  const seen = new Set();
  for (const raw of data.events) {
    if (!raw || typeof raw !== 'object') virhe('events-taulukossa on alkio joka ei ole objekti.');
    const def = EVENT_TYPES[raw.type];
    if (!def) virhe(`tuntematon tapahtumatyyppi "${raw.type}" — sallitut: ${Object.keys(EVENT_TYPES).join(', ')}.`);
    if (!numOk(raw.age)) virhe(`tapahtumalta "${raw.type}" puuttuu ikä (age).`);
    if (def.unique && seen.has(raw.type)) virhe(`tapahtumia tyyppiä "${raw.type}" voi olla vain yksi.`);
    seen.add(raw.type);

    const e = { id: ++id, type: raw.type, age: clamp(raw.age, 0, 105) };
    if (typeof raw.name === 'string' && raw.name.trim()) e.name = raw.name.trim().slice(0, NAME_MAX);

    if (raw.type === 'retirement') {
      e.withdrawal = numOk(raw.withdrawal) ? Math.max(0, raw.withdrawal) : def.withdrawal;
      e.pension = numOk(raw.pension) ? Math.max(0, raw.pension) : 0;
      e.pensionAge = numOk(raw.pensionAge) ? clamp(raw.pensionAge, 0, 120) : 65;
      if (raw.goal != null) {
        if (!['manual', 'withdrawal', 'age', 'saving'].includes(raw.goal)) {
          virhe(`eläketapahtuman goal "${raw.goal}" on tuntematon — sallitut: manual, withdrawal, age, saving.`);
        }
        e.goal = raw.goal;
      }
      if (raw.conf != null) {
        if (!numOk(raw.conf) || raw.conf < 0.5 || raw.conf >= 1) {
          virhe('eläketapahtuman conf pitää olla väliltä 0.5–0.99 (esim. 0.85).');
        }
        e.conf = raw.conf;
      }
    } else {
      e.amount = numOk(raw.amount) ? clamp(raw.amount, -1e9, 1e9) : (def.amount || 0);
      if (raw.financing === 'loan') e.financing = 'loan';
      for (const k of ['down', 'rate', 'years', 'appr']) if (numOk(raw[k])) e[k] = raw[k];
      if (e.financing === 'loan') {
        const loan = def.loan || CONSUMER_LOAN;
        const price = Math.max(0, -e.amount);
        if (e.down == null) e.down = Math.round(price * loan.share);
        e.down = clamp(e.down, 0, 1e9);
        e.rate = e.rate == null ? loan.rate : clamp(e.rate, 0, 25);
        e.years = e.years == null ? loan.years : clamp(e.years, 1, 40);
      }
      if (raw.isAsset || (def.asset && e.amount < 0)) {
        e.isAsset = true;
        if (e.appr == null) e.appr = def.asset ? def.asset.appr : 0;
        e.appr = clamp(e.appr, -30, 15);
      }
      if (numOk(raw.recMonthly) && raw.recMonthly !== 0) {
        e.recMonthly = clamp(raw.recMonthly, -1e5, 1e5);
        e.recYears = numOk(raw.recYears) ? clamp(raw.recYears, 1, 60) : (def.rec ? def.rec.years : 10);
      }
      if (numOk(raw.sellAge) && e.isAsset && raw.sellAge > e.age) {
        e.sellAge = clamp(raw.sellAge, 0, 105);
        e.sellTaxFree = !!raw.sellTaxFree;
      }
      // Omistukset: nykytila alkuehtona — ikä ankkuroituu aina nykyhetkeen
      if (def.owned) {
        e.owned = true;
        e.age = st.ageNow;
        delete e.financing; delete e.down;
        if (!numOk(raw.amount) || raw.amount > 0) e.amount = def.amount;
        e.isAsset = true;
        if (!numOk(e.appr)) e.appr = def.asset.appr;
        e.loanLeft = numOk(raw.loanLeft) ? clamp(raw.loanLeft, 0, 1e9) : 0;
        if (e.loanLeft > 0) {
          e.rate = numOk(raw.rate) ? clamp(raw.rate, 0, 25) : def.own.rate;
          e.years = numOk(raw.years) ? clamp(raw.years, 1, 40) : def.own.years;
        }
        const yNow = new Date().getFullYear();
        if (numOk(raw.boughtYear) && raw.boughtYear >= 1950 && raw.boughtYear <= yNow) {
          e.boughtYear = Math.round(raw.boughtYear);
          e.ownYears = clamp(yNow - e.boughtYear, 0, 90);
        } else e.ownYears = 0;
        if (e.sellAge != null && e.sellAge <= st.ageNow) { delete e.sellAge; delete e.sellTaxFree; }
      }
    }
    st.events.push(e);
  }
  return st;
}

// Yhdistetty sisäänkäynti työkaluille: linkki/JSON → validoitu tila
function lueSuunnitelma(input) {
  return sanitoiSuunnitelma(puraSuunnitelma(input));
}

/* Perhelinkin purku ja validointi: #f= kantaa {persons:[{pid,name,role,child,
   data}], active} — kunkin henkilön data on sama serialize()-muoto kuin
   yksilösuunnitelmassa, joten se kulkee saman sanitoijan läpi. */
const PERHE_MAX = 4;
function puraPerhe(input) {
  if (input && typeof input === 'object') return input;
  if (typeof input !== 'string' || !input.trim()) {
    virhe('perhe puuttuu: anna perhelinkki (varallisuuspolku.com#f=…) tai perhe-JSON-objekti.');
  }
  const s = input.trim();
  let b64 = null;
  const hash = s.indexOf('#f=');
  const single = s.indexOf('#s=');
  if (single >= 0 && hash < 0) {
    virhe('Tämä on yhden henkilön jakolinkki (#s=) — käytä simuloi_suunnitelma-työkalua, tai anna perhelinkki (#f=).');
  }
  if (hash >= 0) b64 = s.slice(hash + 3);
  else if (s.startsWith('{')) {
    try { return JSON.parse(s); }
    catch (e) { virhe('Perhe-JSON ei jäsenny: ' + e.message); }
  } else b64 = s;
  let json;
  try { json = Buffer.from(b64, 'base64').toString('utf8'); }
  catch (e) { virhe('Perhelinkin base64-osa ei purkaudu.'); }
  try { return JSON.parse(json); }
  catch (e) { virhe('Perhelinkki ei sisällä kelvollista perhettä (JSON ei jäsenny). Tarkista että linkki kopioitui kokonaan.'); }
}

function luePerhe(input) {
  const raw = puraPerhe(input);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.persons)) {
    virhe('perheen pitää olla objekti jossa persons-taulukko: {persons:[{name, data}, …]}.');
  }
  if (raw.persons.length < 1) virhe('perheessä pitää olla vähintään yksi henkilö.');
  if (raw.persons.length > PERHE_MAX) virhe(`perheessä voi olla enintään ${PERHE_MAX} henkilöä.`);
  return raw.persons.map((p, i) => {
    if (!p || typeof p !== 'object') virhe(`henkilö ${i + 1} ei ole objekti.`);
    let st;
    try { st = sanitoiSuunnitelma(p.data); }
    catch (e) {
      if (e instanceof SuunnitelmaVirhe) virhe(`henkilö ${i + 1} (${p.name || 'nimetön'}): ${e.message}`);
      throw e;
    }
    return {
      nimi: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 16) : `Henkilö ${i + 1}`,
      rooli: p.role === 'spouse' || p.role === 'child' ? p.role : (i === 0 ? 'me' : (st.ageNow < 18 ? 'child' : 'spouse')),
      st,
    };
  });
}

module.exports = { puraSuunnitelma, sanitoiSuunnitelma, lueSuunnitelma, puraPerhe, luePerhe, EVENT_TYPES, SuunnitelmaVirhe, EVENTS_MAX, PERHE_MAX };
