'use strict';

/* Varallisuuspolku MCP — työkalukerros.

   Ei tiedä mitään siirtotiestä (stdio/HTTP): vie puhtaan listan
   {name, description, inputSchema, run(args)} — server.js kääri sen
   MCP-protokollaan, ja mahdollinen hostattu endpoint saisi saman listan.
   Jokainen työkalu on ohut validoiva kääre laskenta.js:n ympärillä —
   MCP ei tuota yhtään lukua itse. */

const fs = require('fs');
const path = require('path');
const { lueSuunnitelma, luePerhe, EVENT_TYPES, SuunnitelmaVirhe, EVENTS_MAX, PERHE_MAX } = require('./sanitoi.js');

// Julkaistussa paketissa laskenta.js on kopioitu viereen (prepack);
// repossa ajettaessa käytetään suoraan juuren tiedostoa — yksi totuus.
const paikallinen = path.join(__dirname, 'laskenta.js');
const L = require(fs.existsSync(paikallinen) ? paikallinen : path.join(__dirname, '..', 'laskenta.js'));

const MOOTTORI = 'Varallisuuspolku-laskentamoottori, verovuoden 2026 parametrit (tarkistettu 24.7.2026)';
const VASTUUVAPAUS = 'Tämä on laskentatulos, ei sijoitusneuvontaa. Oletukset ja tunnetut yksinkertaistukset: https://varallisuuspolku.com/validointi.html';

const POLUT_OLETUS = 300, POLUT_MAX = 5000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const numOk = (v) => typeof v === 'number' && isFinite(v);
const eur = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
const r1 = (v) => Math.round(v * 10) / 10;

function polutOf(args) {
  return numOk(args && args.polkuja) ? clamp(Math.round(args.polkuja), 100, POLUT_MAX) : POLUT_OLETUS;
}

function virhe(msg) { throw new SuunnitelmaVirhe(msg); }

/* Päämetriikat simulaatiosta — samat pyöristykset kuin UI:ssa, jotta agentin
   siteeraamat luvut täsmäävät sivuston kanssa. */
function metriikat(sim) {
  return {
    onnistumisTodennakoisyysPct: r1(sim.successProb * 100),
    elakeika: sim.retireAge != null ? r1(sim.retireAge) : null,
    varallisuusElakeiassaEur: sim.wAtRet != null ? Math.round(sim.wAtRet) : null,
    loppuvarallisuusEur: Math.round(sim.wEnd),
    kestavaKuukausituloEur: sim.sustainableWd != null ? Math.round(sim.sustainableWd) : null,
    verotYhteensaEur: Math.round(sim.taxPaid),
    varatEhtyvatIassa: sim.depletionAge != null ? r1(sim.depletionAge) : null,
  };
}

/* Vuositaulukko harvennettuna: enintään ~21 riviä (sama henki kuin Tulkin
   kontekstissa) — MCP-vastaus ei saa olla 800 kuukausialkion litania. */
function vuositaulukko(sim, st) {
  const rows = [];
  const years = Math.floor(sim.months / 12);
  const step = Math.max(1, Math.ceil(years / 20));
  for (let y = 0; y <= years; y += step) {
    const m = Math.min(y * 12, sim.months);
    rows.push(rivi(sim, st, m));
  }
  if (rows[rows.length - 1].ika !== r1(sim.a0 + sim.months / 12)) rows.push(rivi(sim, st, sim.months));
  return rows;
}
function rivi(sim, st, m) {
  const row = {
    ika: r1(sim.a0 + m / 12),
    odotettuEur: Math.round(sim.exp[m]),
    p10Eur: Math.round(sim.pess[m]),
    p90Eur: Math.round(sim.opt[m]),
  };
  if (sim.hasNet) row.nettovarallisuusEur = Math.round(sim.net[m]);
  return row;
}

function huomiot(sim, st) {
  const h = [];
  h.push(st.real
    ? `Luvut ovat reaalieuroja (inflaatiokorjattu ${st.inflation} %/v — nykyrahan ostovoimaa).`
    : 'Luvut ovat nimellisiä euroja (ei inflaatiokorjausta).');
  if (sim.goalUnreachable) h.push('Tavoite ei ole saavutettavissa näillä lähtötiedoilla.');
  if (sim.dryZones && sim.dryZones.length) {
    const jaksot = sim.dryZones.map((z) => `${r1(z.from)}–${r1(z.to)} v`).join(', ');
    h.push(sim.dryKind === 'floor'
      ? `Tulo alittaa tarpeen jaksoilla: ${jaksot}.`
      : `Sijoitusvarat ehtyvät jaksoilla: ${jaksot}.`);
  }
  const pro = L.proOf(st);
  if (pro && pro.wd.mode !== 'fixed') {
    h.push('Suunnitelmassa on prosenttipohjainen nostostrategia (Pro): salkku ei matemaattisesti ehdy, joten tavoiteratkaisijat eivät ole käytössä ja riittävyys mitataan tulolattiaa vasten.');
  }
  if (st.events.some((e) => EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly)) {
    h.push('Suunnitelmassa on siirtotapahtumia (perhetila) — MCP laskee ne yksittäisinä kassavirtoina ilman vastinparia.');
  }
  return h;
}

function kehys(rakenne, teksti) {
  rakenne.moottori = MOOTTORI;
  rakenne.vastuuvapaus = VASTUUVAPAUS;
  return { rakenne, teksti: teksti + '\n\n' + VASTUUVAPAUS };
}

const SUUNNITELMA_SCHEMA = {
  description: 'Suunnitelma: jakolinkki (https://varallisuuspolku.com#s=…), pelkkä #s=-hash tai serialize()-muotoinen JSON-objekti. Skeeman saa työkalulla suunnitelman_skeema.',
  anyOf: [{ type: 'string' }, { type: 'object' }],
};
const POLKUJA_SCHEMA = {
  type: 'integer', minimum: 100, maximum: POLUT_MAX, default: POLUT_OLETUS,
  description: `Monte Carlo -polkujen määrä (${POLUT_OLETUS} = nopea oletus, ${POLUT_MAX} = tarkka mutta hitaampi). Tulokset ovat deterministisiä: sama syöte ja polkumäärä antaa aina täsmälleen saman vastauksen.`,
};
const VARMUUSTASO_SCHEMA = {
  type: 'number', minimum: 0.5, maximum: 0.99,
  description: 'Valinnainen Monte Carlo -varmuustaso (tyypillisesti 0.75, 0.85 tai 0.95). Ilman tätä ratkaisu on deterministinen odotuspolulla.',
};

/* ===================== Työkalut ===================== */

const TYOKALUT = [
  {
    name: 'simuloi_suunnitelma',
    title: 'Simuloi suunnitelma',
    description: 'Laskee Varallisuuspolku-suunnitelman koko elinkaaren: varallisuus eläkeiässä ja lopussa, onnistumistodennäköisyys (Monte Carlo), kestävä kuukausitulo, verot, ehtymisriskit ja vuositaulukko. Deterministinen suomalainen elinkaarimoottori (työeläke, myyntivoittovero, hankintameno-olettama, sijoituskuoret) — laskee, ei suosittele. / Simulates a Finnish lifecycle wealth plan; computes, never advises.',
    inputSchema: {
      type: 'object',
      properties: { suunnitelma: SUUNNITELMA_SCHEMA, polkuja: POLKUJA_SCHEMA },
      required: ['suunnitelma'],
    },
    run(args) {
      const st = lueSuunnitelma(args.suunnitelma);
      const polut = polutOf(args);
      const sim = L.simulate(st, { paths: polut, sustainable: true });
      const m = metriikat(sim);
      const rakenne = {
        polkuja: polut,
        metriikat: m,
        huomiot: huomiot(sim, st),
        vuositaulukko: vuositaulukko(sim, st),
      };
      if (sim.goal && sim.goal !== 'manual') {
        rakenne.ratkaistu = {
          tavoite: sim.goal,
          varmuustaso: sim.conf,
          kestavaKuukausituloEur: sim.solvedWithdrawal != null ? Math.round(sim.solvedWithdrawal) : undefined,
          aikaisinElakeika: sim.solvedRetireAge != null ? r1(sim.solvedRetireAge) : undefined,
          tarvittavaKuukausisaastoEur: sim.requiredMonthly != null ? Math.round(sim.requiredMonthly) : undefined,
          saavutettavissa: !sim.goalUnreachable,
        };
      }
      if (sim.stress) {
        rakenne.stressit = sim.stress.map((s) => ({
          nimi: s.name,
          loppuvarallisuusEur: Math.round(s.arr[sim.months]),
          varatEhtyvatIassa: s.depletion != null ? r1(s.depletion) : null,
        }));
      }
      const rivit = [
        `Simulaatio (${polut} polkua): onnistumistodennäköisyys ${m.onnistumisTodennakoisyysPct} %.`,
        m.varallisuusElakeiassaEur != null ? `Varallisuus eläkeiässä (${m.elakeika} v): ${eur(m.varallisuusElakeiassaEur)}.` : null,
        `Loppuvarallisuus (${st.ageEnd} v): ${eur(m.loppuvarallisuusEur)} (P10 ${eur(sim.pess[sim.months])} – P90 ${eur(sim.opt[sim.months])}).`,
        m.kestavaKuukausituloEur != null ? `Kestävä kuukausitulo eläkkeellä: ${eur(m.kestavaKuukausituloEur)}/kk.` : null,
        `Verot yhteensä: ${eur(m.verotYhteensaEur)}.`,
        m.varatEhtyvatIassa != null ? `HUOM: varat/tulo ehtyy noin ${m.varatEhtyvatIassa} vuoden iässä.` : null,
        ...rakenne.huomiot,
      ].filter(Boolean);
      return kehys(rakenne, rivit.join('\n'));
    },
  },

  {
    name: 'ratkaise_elakeika',
    title: 'Ratkaise aikaisin eläkeikä',
    description: 'Ratkaisee aikaisimman mahdollisen eläkeiän annetulla kuukausitulotarpeella: binäärihaku moottorin yli, deterministisesti tai Monte Carlo -varmuustasolla. Vastaa kysymykseen "milloin aikaisintaan voin jäädä eläkkeelle?". Laskee, ei suosittele.',
    inputSchema: {
      type: 'object',
      properties: {
        suunnitelma: SUUNNITELMA_SCHEMA,
        kuukausitulo: { type: 'number', minimum: 0, maximum: 1e6, description: 'Tarvittava kuukausitulo eläkkeellä (€/kk, sisältää työeläkkeen — sijoituksista nostetaan erotus).' },
        varmuustaso: VARMUUSTASO_SCHEMA,
        polkuja: POLKUJA_SCHEMA,
      },
      required: ['suunnitelma', 'kuukausitulo'],
    },
    run(args) {
      if (!numOk(args.kuukausitulo) || args.kuukausitulo < 0) virhe('kuukausitulo puuttuu tai ei ole luku (€/kk).');
      const st = lueSuunnitelma(args.suunnitelma);
      const retire = st.events.find((e) => e.type === 'retirement');
      if (!retire) virhe('Suunnitelmassa ei ole eläketapahtumaa. Lisää events-taulukkoon esim. {type:"retirement", age:65, withdrawal:2400, pension:1500, pensionAge:65}.');
      const pro = L.proOf(st);
      if (pro && pro.wd.mode !== 'fixed') virhe('Prosenttipohjaisessa nostostrategiassa (Pro) salkku ei ehdy, joten eläkeikää ei voi ratkaista — käytä kiinteää nostostrategiaa tai simuloi_suunnitelma-työkalua.');
      retire.goal = 'age';
      retire.withdrawal = clamp(args.kuukausitulo, 0, 1e6);
      if (numOk(args.varmuustaso)) retire.conf = clamp(args.varmuustaso, 0.5, 0.99);
      else delete retire.conf;
      const polut = polutOf(args);
      const sim = L.simulate(st, { paths: polut, sustainable: true });
      const m = metriikat(sim);
      const rakenne = {
        kuukausituloEur: Math.round(retire.withdrawal),
        varmuustaso: retire.conf != null ? retire.conf : null,
        saavutettavissa: !sim.goalUnreachable,
        aikaisinElakeika: sim.solvedRetireAge != null ? r1(sim.solvedRetireAge) : null,
        metriikat: m,
        huomiot: huomiot(sim, st),
      };
      const teksti = sim.goalUnreachable
        ? `Kuukausitulo ${eur(retire.withdrawal)}/kk ei ole saavutettavissa näillä tiedoilla edes suunnitelman loppuun asti työskennellen${retire.conf ? ` varmuustasolla ${Math.round(retire.conf * 100)} %` : ''}.`
        : `Aikaisin eläkeikä tulotarpeella ${eur(retire.withdrawal)}/kk: ${rakenne.aikaisinElakeika} vuotta${retire.conf ? ` (varmuustaso ${Math.round(retire.conf * 100)} %)` : ' (deterministinen odotuspolku)'}.\nOnnistumistodennäköisyys tässä iässä: ${m.onnistumisTodennakoisyysPct} %. Varallisuus eläkeiässä: ${eur(m.varallisuusElakeiassaEur || 0)}.`;
      return kehys(rakenne, teksti);
    },
  },

  {
    name: 'ratkaise_saasto',
    title: 'Ratkaise tarvittava kuukausisäästö',
    description: 'Ratkaisee kuukausisäästön, jolla annettu eläkeikä ja kuukausitulo toteutuvat — deterministisesti tai Monte Carlo -varmuustasolla. Vastaa kysymykseen "paljonko minun pitää säästää?". Laskee, ei suosittele.',
    inputSchema: {
      type: 'object',
      properties: {
        suunnitelma: SUUNNITELMA_SCHEMA,
        elakeika: { type: 'number', minimum: 18, maximum: 100, description: 'Tavoiteltu eläkkeellejäänti-ikä (vuosina).' },
        kuukausitulo: { type: 'number', minimum: 0, maximum: 1e6, description: 'Tarvittava kuukausitulo eläkkeellä (€/kk, sisältää työeläkkeen).' },
        varmuustaso: VARMUUSTASO_SCHEMA,
        polkuja: POLKUJA_SCHEMA,
      },
      required: ['suunnitelma', 'elakeika', 'kuukausitulo'],
    },
    run(args) {
      if (!numOk(args.elakeika)) virhe('elakeika puuttuu tai ei ole luku.');
      if (!numOk(args.kuukausitulo) || args.kuukausitulo < 0) virhe('kuukausitulo puuttuu tai ei ole luku (€/kk).');
      const st = lueSuunnitelma(args.suunnitelma);
      if (args.elakeika <= st.ageNow) virhe(`elakeika (${args.elakeika}) pitää olla suurempi kuin nykyikä (${st.ageNow}).`);
      if (args.elakeika >= st.ageEnd - 1) virhe(`elakeika (${args.elakeika}) pitää olla ennen suunnitelman loppua (${st.ageEnd} v).`);
      const retire = st.events.find((e) => e.type === 'retirement');
      if (!retire) virhe('Suunnitelmassa ei ole eläketapahtumaa. Lisää events-taulukkoon esim. {type:"retirement", age:65, withdrawal:2400, pension:1500, pensionAge:65}.');
      const pro = L.proOf(st);
      if (pro && pro.wd.mode !== 'fixed') virhe('Prosenttipohjaisessa nostostrategiassa (Pro) tarvittavaa säästöä ei voi ratkaista — käytä kiinteää nostostrategiaa.');
      retire.goal = 'saving';
      retire.age = args.elakeika;
      retire.withdrawal = clamp(args.kuukausitulo, 0, 1e6);
      if (numOk(args.varmuustaso)) retire.conf = clamp(args.varmuustaso, 0.5, 0.99);
      else delete retire.conf;
      const polut = polutOf(args);
      const sim = L.simulate(st, { paths: polut });
      const rakenne = {
        elakeika: args.elakeika,
        kuukausituloEur: Math.round(retire.withdrawal),
        varmuustaso: retire.conf != null ? retire.conf : null,
        saavutettavissa: !sim.goalUnreachable,
        tarvittavaKuukausisaastoEur: sim.requiredMonthly != null ? Math.round(sim.requiredMonthly) : null,
        nykyinenKuukausisaastoEur: Math.round(st.monthly),
      };
      let teksti;
      if (sim.goalUnreachable || sim.requiredMonthly == null) {
        teksti = `Eläkeikä ${args.elakeika} v tulolla ${eur(retire.withdrawal)}/kk ei ole saavutettavissa millään realistisella kuukausisäästöllä näillä tiedoilla.`;
      } else {
        // Näytetään myös lopputilanne ratkaistulla säästöllä — sim-metriikat
        // laskettiin nykyisellä säästöllä, eivät ratkaistulla
        const st2 = lueSuunnitelma(args.suunnitelma);
        const r2 = st2.events.find((e) => e.type === 'retirement');
        r2.age = args.elakeika;
        r2.withdrawal = retire.withdrawal;
        delete r2.goal; delete r2.conf;
        st2.monthly = sim.requiredMonthly;
        const sim2 = L.simulate(st2, { paths: polut, sustainable: true });
        rakenne.metriikatTarvittavallaSaastolla = metriikat(sim2);
        rakenne.huomiot = huomiot(sim2, st2);
        if (st.savePhases) rakenne.huomiot.push('Suunnitelmassa on porrastettu säästöaikataulu (savePhases) — ratkaistu summa korvaa koko aikataulun tasaisella säästöllä.');
        teksti = `Tarvittava kuukausisäästö: ${eur(sim.requiredMonthly)}/kk (nyt ${eur(st.monthly)}/kk), jotta eläkkeelle ${args.elakeika}-vuotiaana tulolla ${eur(retire.withdrawal)}/kk${retire.conf ? ` varmuustasolla ${Math.round(retire.conf * 100)} %` : ''}.\nTällä säästöllä onnistumistodennäköisyys on ${rakenne.metriikatTarvittavallaSaastolla.onnistumisTodennakoisyysPct} %.`;
      }
      return kehys(rakenne, teksti);
    },
  },

  {
    name: 'vertaa_suunnitelmia',
    title: 'Vertaa suunnitelmia',
    description: 'Simuloi 2–4 suunnitelmaa ja palauttaa vertailutaulukon: onnistumistodennäköisyys, varojen riittävyys, kestävä kuukausitulo, loppuvarallisuus ja verot — paras arvo merkittynä. Käyttö esim. "vertaa eläkeikiä 60 ja 65": kloonaa suunnitelma, muuta yhtä kenttää, anna molemmat. Lukupohjainen: laskee ja vertailee, ei suosittele.',
    inputSchema: {
      type: 'object',
      properties: {
        suunnitelmat: {
          type: 'array', minItems: 2, maxItems: 4,
          items: {
            type: 'object',
            properties: { nimi: { type: 'string', description: 'Vaihtoehdon nimi vertailutaulukkoon (esim. "Eläkkeelle 60 v").' }, suunnitelma: SUUNNITELMA_SCHEMA },
            required: ['nimi', 'suunnitelma'],
          },
        },
        polkuja: POLKUJA_SCHEMA,
      },
      required: ['suunnitelmat'],
    },
    run(args) {
      if (!Array.isArray(args.suunnitelmat) || args.suunnitelmat.length < 2 || args.suunnitelmat.length > 4) {
        virhe('suunnitelmat: anna 2–4 vaihtoehtoa muodossa [{nimi, suunnitelma}, …].');
      }
      const polut = polutOf(args);
      const vaihtoehdot = args.suunnitelmat.map((v, i) => {
        if (!v || typeof v !== 'object') virhe(`vaihtoehto ${i + 1} ei ole objekti.`);
        const nimi = typeof v.nimi === 'string' && v.nimi.trim() ? v.nimi.trim().slice(0, 60) : `Vaihtoehto ${i + 1}`;
        let st, sim;
        try {
          st = lueSuunnitelma(v.suunnitelma);
          sim = L.simulate(st, { paths: polut, sustainable: true });
        } catch (e) {
          if (e instanceof SuunnitelmaVirhe) virhe(`vaihtoehto "${nimi}": ${e.message}`);
          throw e;
        }
        return { nimi, metriikat: metriikat(sim), st };
      });
      // Paras arvo per mittari — ei korostusta jos kaikki samat (kohinanesto,
      // sama sääntö kuin Tulkin vertailutaulukossa)
      const paras = {};
      const saannot = [
        ['onnistumisTodennakoisyysPct', (a, b) => a > b],
        ['kestavaKuukausituloEur', (a, b) => (a == null ? false : b == null ? true : a > b)],
        ['loppuvarallisuusEur', (a, b) => a > b],
        ['verotYhteensaEur', (a, b) => a < b],
        ['varatEhtyvatIassa', (a, b) => (a == null ? b != null : b != null && a > b)],
      ];
      for (const [key, parempi] of saannot) {
        let idx = 0;
        let kaikkiSamat = true;
        for (let i = 1; i < vaihtoehdot.length; i++) {
          const a = vaihtoehdot[i].metriikat[key], b = vaihtoehdot[idx].metriikat[key];
          if (a !== b) kaikkiSamat = false;
          if (parempi(a, b)) idx = i;
        }
        paras[key] = kaikkiSamat ? null : idx;
      }
      const rakenne = {
        polkuja: polut,
        vaihtoehdot: vaihtoehdot.map((v) => ({ nimi: v.nimi, metriikat: v.metriikat })),
        parasIndeksi: paras,
      };
      const tahti = (key, i) => (paras[key] === i ? ' ◀ paras' : '');
      const lohkot = vaihtoehdot.map((v, i) => {
        const m = v.metriikat;
        return [
          `${v.nimi}:`,
          `  Onnistuminen ${m.onnistumisTodennakoisyysPct} %${tahti('onnistumisTodennakoisyysPct', i)}`,
          `  Varat riittävät ${m.varatEhtyvatIassa == null ? 'loppuun asti' : '~' + m.varatEhtyvatIassa + ' v ikään'}${tahti('varatEhtyvatIassa', i)}`,
          m.kestavaKuukausituloEur != null ? `  Kestävä tulo ${eur(m.kestavaKuukausituloEur)}/kk${tahti('kestavaKuukausituloEur', i)}` : null,
          `  Loppuvarallisuus ${eur(m.loppuvarallisuusEur)}${tahti('loppuvarallisuusEur', i)}`,
          `  Verot ${eur(m.verotYhteensaEur)}${tahti('verotYhteensaEur', i)}`,
        ].filter(Boolean).join('\n');
      });
      return kehys(rakenne, `Vertailu (${polut} polkua/vaihtoehto):\n\n` + lohkot.join('\n\n'));
    },
  },

  {
    name: 'simuloi_perhe',
    title: 'Simuloi perhe',
    description: `Laskee koko kotitalouden (enintään ${PERHE_MAX} henkilöä): jokaisen henkilön oma elinkaari + perheen yhteinen onnistumistodennäköisyys KOHERENTILLA Monte Carlolla — sama markkinahistoria osuu kaikkiin samaan kalenteriaikaan, joten yhteinen luku ei ole itsenäisten todennäköisyyksien tulo. Syöte: perhelinkki (varallisuuspolku.com#f=…) tai perhe-JSON. Laskee, ei suosittele.`,
    inputSchema: {
      type: 'object',
      properties: {
        perhe: {
          description: 'Perhelinkki (#f=…) tai perhe-JSON {persons:[{name, role, data}, …]} — kunkin henkilön data on sama suunnitelmamuoto kuin yksilötyökaluissa.',
          anyOf: [{ type: 'string' }, { type: 'object' }],
        },
        polkuja: POLKUJA_SCHEMA,
      },
      required: ['perhe'],
    },
    run(args) {
      const henkilot = luePerhe(args.perhe);
      const polut = polutOf(args);
      const simit = henkilot.map((h) => L.simulate(h.st, { paths: polut, sustainable: true }));
      // Koherentti kotitalous-MC: kaikki polut jakavat henkilön 1 shokkijonon —
      // sama moottorifunktio jota sivuston perhetila käyttää
      const joint = L.mcHousehold(henkilot.map((h) => h.st), { paths: polut });
      const yhteis = L.householdExp(simit);
      const rakenne = {
        polkuja: polut,
        perheenOnnistumisTodennakoisyysPct: r1(joint.successProb * 100),
        yhteisvarallisuusLopussaEur: Math.round(yhteis[joint.months]),
        henkilot: henkilot.map((h, i) => ({
          nimi: h.nimi,
          rooli: h.rooli,
          metriikat: metriikat(simit[i]),
        })),
        huomiot: [
          'Perheen onnistuminen = KAIKKI henkilöt selviävät samassa markkinahistoriassa (koherentti MC).',
          ...henkilot.flatMap((h, i) => huomiot(simit[i], h.st)
            .filter((t) => !t.startsWith('Luvut ovat'))
            .map((t) => `${h.nimi}: ${t}`)),
          henkilot[0].st.real ? 'Luvut ovat reaalieuroja (inflaatiokorjattu).' : 'Luvut ovat nimellisiä euroja.',
        ],
      };
      const rivit = [
        `Perhe (${henkilot.length} henkilöä, ${polut} polkua): yhteinen onnistumistodennäköisyys ${rakenne.perheenOnnistumisTodennakoisyysPct} % — kaikki selviävät samassa markkinahistoriassa.`,
        `Yhteisvarallisuus suunnitelmien lopussa: ${eur(rakenne.yhteisvarallisuusLopussaEur)}.`,
        ...rakenne.henkilot.map((h) => {
          const m = h.metriikat;
          return `${h.nimi}${h.rooli === 'child' ? ' (lapsi)' : ''}: onnistuminen ${m.onnistumisTodennakoisyysPct} %` +
            (m.elakeika != null ? `, eläkkeelle ${m.elakeika} v` : '') +
            (m.kestavaKuukausituloEur != null ? `, kestävä tulo ${eur(m.kestavaKuukausituloEur)}/kk` : '') +
            `, loppuvarallisuus ${eur(m.loppuvarallisuusEur)}.`;
        }),
      ];
      return kehys(rakenne, rivit.join('\n'));
    },
  },
  {
    name: 'suunnitelman_skeema',
    title: 'Suunnitelman skeema',
    description: 'Palauttaa suunnitelma-JSON:n koneluettavan kenttädokumentaation: perustiedot, kaikki tapahtumatyypit kenttineen, rajat ja valmiit esimerkit. Kutsu tätä ENSIN kun rakennat suunnitelman keskustelusta tyhjästä ilman jakolinkkiä.',
    inputSchema: { type: 'object', properties: {} },
    run() {
      const tapahtumatyypit = {};
      for (const [type, def] of Object.entries(EVENT_TYPES)) {
        const t = { nimi: def.label };
        if (type === 'retirement') {
          t.kentat = {
            age: 'eläkkeellejäänti-ikä (pakollinen)',
            withdrawal: `kuukausitulon tarve eläkkeellä €/kk (oletus ${def.withdrawal}; sisältää työeläkkeen)`,
            pension: `lakisääteinen työeläke €/kk (oletus 0 jos ei annettu; UI-oletus ${def.pension})`,
            pensionAge: `työeläkkeen alkamisikä (oletus ${def.pensionAge}; voi olla myöhempi kuin age — välivuodet katetaan sijoituksista)`,
            goal: 'valinnainen tavoitetila: "withdrawal" (ratkaise kestävä tulo), "age" (ratkaise aikaisin eläkeikä), "saving" (ratkaise tarvittava säästö), "manual" (ei ratkaisua)',
            conf: 'valinnainen Monte Carlo -varmuustaso tavoitteelle (0.5–0.99, tyypillisesti 0.75/0.85/0.95)',
          };
          t.huom = 'Enintään yksi per suunnitelma. Ilman eläketapahtumaa simulaatio on pelkkä kertymä.';
        } else if (def.owned) {
          t.kentat = {
            amount: `NEGATIIVINEN nykyarvo € (oletus ${def.amount}; esim. -250000 = 250 000 €:n asunto)`,
            loanLeft: `jäljellä oleva laina € (oletus 0; tyypillinen ${def.own.loanLeft})`,
            rate: `lainan korko %/v (oletus ${def.own.rate})`,
            years: `lainaa jäljellä vuosia (oletus ${def.own.years})`,
            appr: `arvonkehitys %/v (oletus ${def.asset.appr})`,
            boughtYear: 'hankintavuosi (valinnainen; vaikuttaa vain verollisen myynnin hankintameno-olettamaan)',
            sellAge: 'valinnainen myynti-ikä — arvo siirtyy sijoituksiin, laina maksetaan pois',
            sellTaxFree: 'true = veroton myynti (oma asunto, 2 v asuttu)',
          };
          t.huom = 'Jo omistettu omaisuus: ei ostohetken kassavirtaa, ikä ankkuroituu nykyhetkeen automaattisesti.' + (def.rec ? ` Oletuksena vuokratulo ${def.rec.monthly} €/kk ${def.rec.years} v (recMonthly/recYears).` : '');
        } else if (def.metric) {
          t.kentat = { age: 'tavoiteikä', amount: `tavoiteltu varallisuus € (oletus ${def.amount})` };
          t.huom = 'Mittari, ei kassavirta — simulaattori ohittaa, MC kertoo ylitysosuuden.';
        } else {
          t.kentat = {
            age: 'tapahtumaikä (pakollinen)',
            amount: `summa € (oletus ${def.amount}; negatiivinen = meno, positiivinen = tulo)`,
          };
          if (def.loan && def.defaultFin) {
            t.kentat.financing = `"loan" = lainarahoitus (oletus: ${def.defaultFin === 'loan' ? 'laina' : 'käteinen'})`;
            t.kentat.down = `käsiraha € lainalla (oletus ${Math.round((def.loan.share || 0) * 100)} % summasta)`;
            t.kentat.rate = `lainan korko %/v (oletus ${def.loan.rate})`;
            t.kentat.years = `laina-aika vuosia (oletus ${def.loan.years})`;
          }
          if (def.asset) {
            t.kentat.appr = `arvonkehitys %/v (oletus ${def.asset.appr}) — omaisuuserä, näkyy nettovarallisuudessa`;
            t.kentat.sellAge = 'valinnainen myynti-ikä (arvo sijoituksiin, laina pois)';
            t.kentat.sellTaxFree = 'true = veroton myynti';
          }
          if (def.rec) {
            t.kentat.recMonthly = `toistuva erä €/kk (oletus ${def.rec.monthly})`;
            t.kentat.recYears = `toiston kesto vuosia (oletus ${def.rec.years})`;
          }
          if (def.familyOnly) t.huom = 'Perhetilan siirto — MCP laskee yksittäisenä kassavirtana ilman vastinparia; vältä ilman perhetietoa.';
        }
        tapahtumatyypit[type] = t;
      }
      const rakenne = {
        kentat: {
          pakolliset: {
            ageNow: 'nykyikä vuosina (0–105)',
            ageEnd: 'suunnitelman loppuikä (yleensä 90–100)',
            startCapital: 'nykyinen sijoitusvarallisuus €',
            monthly: 'kuukausisäästö €/kk',
            events: 'tapahtumataulukko (tyhjä [] käy; eläkelaskenta vaatii retirement-tapahtuman)',
          },
          valinnaiset: {
            allocStocks: 'osakepaino % (oletus 70)',
            allocBonds: 'korkopaino % (oletus 20; loppu käteistä)',
            glide: 'true = osakepaino laskee automaattisesti iän myötä (glidepath)',
            real: 'true = tulokset reaalieuroina (inflaatiokorjattu)',
            inflation: 'inflaatio-oletus %/v (oletus 2)',
            tax: 'true = myyntivoittovero nostoissa (30/34 %; suositus true)',
            savingsGrowth: 'säästön vuosikasvu %/v eli palkkakehitys (oletus 0)',
            savePhases: 'porrastettu säästö [{to: ikäraja, amount: €/kk}] nousevassa ikäjärjestyksessä, enintään 8 — korvaa monthly-kentän',
            income: 'nettotulot €/kk (vain dokumentaatioksi)',
            expenses: 'menot €/kk (eläketarpeen oletus)',
            acct: 'sijoitustili: "aot" (arvo-osuustili, oletus) | "ost" (osakesäästötili) | "ins" (vakuutuskuori)',
            feePct: 'sijoituskulut %/v (TER)',
            wrapFee: 'vakuutuskuoren kulu %/v (vain ins)',
            divYield: 'suorien osakkeiden osinkotuotto %/v (0 = kasvurahastot)',
            proOn: 'Pro-tila: omat markkinaoletukset, nostostrategiat ym. — jätä pois ellei jakolinkki tuo',
          },
        },
        tapahtumatyypit,
        rajat: { tapahtumiaEnintaan: EVENTS_MAX, savePhasesEnintaan: 8, ikaAlue: '0–105' },
        jakolinkki: 'https://varallisuuspolku.com#s=<base64(utf8-JSON)> — sama muoto molempiin suuntiin: työkalut hyväksyvät linkin, ja suunnitelman voi avata selaimessa koodaamalla JSON:n base64:ksi.',
        esimerkit: {
          perussuunnitelma: {
            ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000,
            allocStocks: 70, allocBonds: 20, tax: true, savingsGrowth: 1.5,
            events: [{ type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 }],
          },
          tapahtumarikas: {
            ageNow: 35, ageEnd: 92, startCapital: 60000, monthly: 800,
            allocStocks: 80, allocBonds: 10, tax: true,
            savePhases: [{ to: 45, amount: 800 }, { to: 55, amount: 1200 }, { to: 92, amount: 600 }],
            events: [
              { type: 'ownHome', age: 35, amount: -280000, loanLeft: 150000, rate: 3.5, years: 20, appr: 2.0, boughtYear: 2021 },
              { type: 'child', age: 37, amount: -3000, recMonthly: -300, recYears: 18 },
              { type: 'cottage', age: 45, amount: -120000, financing: 'loan', down: 30000, rate: 4.0, years: 15, isAsset: true, appr: 2.0 },
              { type: 'retirement', age: 63, withdrawal: 2600, pension: 1600, pensionAge: 65, goal: 'withdrawal', conf: 0.85 },
            ],
          },
          kysymys_milloin_elakkeelle: 'Kutsu ratkaise_elakeika suunnitelmalla + kuukausitulo. Vertailuun ("60 vai 65?") kloonaa suunnitelma, muuta retirement-tapahtuman age, ja kutsu vertaa_suunnitelmia.',
        },
      };
      return kehys(rakenne,
        'Suunnitelman skeema palautettu rakenteisena (structuredContent): pakolliset kentät ageNow/ageEnd/startCapital/monthly/events, ' +
        Object.keys(EVENT_TYPES).length + ' tapahtumatyyppiä kenttineen ja 2 valmista esimerkkiä. ' +
        'Rakenna suunnitelma näillä kentillä ja anna se simuloi_suunnitelma-työkalulle. Summat euroina, menot negatiivisina.');
    },
  },
];

module.exports = { TYOKALUT, MOOTTORI, VASTUUVAPAUS, SuunnitelmaVirhe };
