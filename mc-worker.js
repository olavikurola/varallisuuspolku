'use strict';

/* Varallisuuspolku — Monte Carlo -worker.
   Tarkentaa onnistumis-%:n, viuhkan ja tavoiteosuudet täydellä polkumäärällä
   (MC_FULL) pois päälangasta, jotta raahaus pysyy sulavana ja HUD päivittyy
   irrotuksen jälkeen ilman että käyttöliittymä jäätyy. Sama laskentaydin
   kuin sivulla — laskentaa ei duplikoida. */

importScripts('laskenta.js');

self.onmessage = (e) => {
  const d = e.data;
  try {
    if (d.task === 'mc') {
      // Kiinteät päätösarvot päälangalta → kesto lineaarinen polkumäärään
      const r = mcBand(d.st, {
        paths: d.paths || MC_FULL,
        withdrawal: d.withdrawal,
        retireAge: d.retireAge,
        goals: d.goals || null,
      });
      // kind kaiutetaan takaisin: 'cur' päivittää simin, 'ghost' vain haamun
      self.postMessage({
        seq: d.seq, task: 'mc', kind: d.kind, ok: true,
        successProb: r.successProb, p10: r.p10, p90: r.p90,
        goalShares: r.goalShares, months: r.months, paths: r.paths,
      }, [r.p10.buffer, r.p90.buffer]);
    } else if (d.task === 'solveGoals') {
      // Varmuustasomoodin Ratkaise: karkea→tarkka-bisektio + edistyminen
      const res = solveGoalsMonthlyConf(d.st, d.points, d.conf, d.paths || MC_FULL,
        (p) => self.postMessage({ seq: d.seq, task: 'solveGoals', progress: p }));
      self.postMessage({ seq: d.seq, task: 'solveGoals', ok: true, result: res });
    }
  } catch (err) {
    self.postMessage({ seq: d.seq, task: d.task, ok: false, error: String(err && err.message || err) });
  }
};
