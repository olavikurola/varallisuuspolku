#!/usr/bin/env node
'use strict';

/* Varallisuuspolku MCP -palvelin — stdio, riippuvuudeton.

   Käsin kirjoitettu JSON-RPC 2.0 + MCP-kättely (sama riippumattomuusperiaate
   kuin palvelin/server.js): tarvittava protokollapinta on pieni ja vakaa
   (initialize, tools/list, tools/call, ping). Viestit ovat rivinvaihdolla
   erotettua JSONia stdin→stdout; stdoutiin EI saa kirjoittaa mitään muuta.

   Paikallinen ja tilaton: ei verkkoa, ei lokia, ei tallennusta — suunnitelma
   ei poistu koneelta (tietosuojalupauksen jatke agenttikäyttöön). */

const { TYOKALUT, MOOTTORI, SuunnitelmaVirhe } = require('./tyokalut.js');
const VERSIO = require('./package.json').version;

// Uusin ensin — initialize vastaa asiakkaan versiolla jos se on tuettu,
// muuten omalla uusimmalla (MCP-spesifikaation neuvottelusääntö)
const PROTOKOLLAT = ['2025-06-18', '2025-03-26', '2024-11-05'];

function vastaa(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function virheVastaus(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function kasittele(msg) {
  const { id, method, params } = msg;
  const notif = id === undefined || id === null;

  if (method === 'initialize') {
    const pyydetty = params && params.protocolVersion;
    vastaa(id, {
      protocolVersion: PROTOKOLLAT.includes(pyydetty) ? pyydetty : PROTOKOLLAT[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'varallisuuspolku-mcp', title: 'Varallisuuspolku', version: VERSIO },
      instructions:
        'Varallisuuspolun (varallisuuspolku.com) deterministinen elinkaarilaskin: suomalainen eläke- ja ' +
        'varallisuussimulaatio (työeläke, myyntivoittovero, hankintameno-olettama, sijoituskuoret, Monte Carlo). ' +
        'Syötteeksi käy jakolinkki (#s=…) tai suunnitelma-JSON — kutsu suunnitelman_skeema jos rakennat ' +
        'suunnitelman keskustelusta tyhjästä. Kaikki laskenta tapahtuu paikallisesti eikä mitään lähetetä ' +
        'minnekään. Työkalut laskevat, eivät anna sijoitusneuvontaa — älä esitä tuloksia suosituksina. ' +
        `Moottori: ${MOOTTORI}.`,
    });
    return;
  }
  if (notif) return; // notifications/initialized ym. — ei vastausta
  if (method === 'ping') { vastaa(id, {}); return; }

  if (method === 'tools/list') {
    vastaa(id, {
      tools: TYOKALUT.map((t) => ({
        name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
      })),
    });
    return;
  }

  if (method === 'tools/call') {
    const name = params && params.name;
    const tyokalu = TYOKALUT.find((t) => t.name === name);
    if (!tyokalu) { virheVastaus(id, -32602, `Tuntematon työkalu: ${name}`); return; }
    try {
      const { rakenne, teksti } = tyokalu.run((params && params.arguments) || {});
      vastaa(id, { content: [{ type: 'text', text: teksti }], structuredContent: rakenne, isError: false });
    } catch (e) {
      // Työkaluvirhe kulkee tuloksena (isError), ei protokollavirheenä —
      // näin malli näkee viestin ja osaa korjata syötteen (MCP-käytäntö)
      const viesti = e instanceof SuunnitelmaVirhe ? e.message : 'Odottamaton virhe: ' + e.message;
      vastaa(id, { content: [{ type: 'text', text: 'Virhe: ' + viesti }], isError: true });
    }
    return;
  }

  virheVastaus(id, -32601, `Tuntematon metodi: ${method}`);
}

let puskuri = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (pala) => {
  puskuri += pala;
  let i;
  while ((i = puskuri.indexOf('\n')) >= 0) {
    const rivi = puskuri.slice(0, i).trim();
    puskuri = puskuri.slice(i + 1);
    if (!rivi) continue;
    let msg;
    try { msg = JSON.parse(rivi); }
    catch (e) { virheVastaus(null, -32700, 'JSON ei jäsenny'); continue; }
    try { kasittele(msg); }
    catch (e) {
      // Puolustuslinja: käsittelijän odottamaton kaatuminen ei saa tappaa palvelinta
      if (msg && msg.id !== undefined && msg.id !== null) virheVastaus(msg.id, -32603, 'Sisäinen virhe: ' + e.message);
      else process.stderr.write('varallisuuspolku-mcp: ' + (e.stack || e.message) + '\n');
    }
  }
});
process.stdin.on('end', () => process.exit(0));
