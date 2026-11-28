export function parseBulkQuestions(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return [];

  // 1) Try JSON array
  if (txt.startsWith("[") || txt.includes('"question_text"')) {
    try {
      const a = txt.indexOf("[");
      const b = txt.lastIndexOf("]");
      const arr = JSON.parse(a !== -1 && b > a ? txt.slice(a, b + 1) : txt);
      if (Array.isArray(arr)) return arr;
    } catch {}
  }

  // 2) Try CSV
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes(",") && /option_a|question/i.test(lines[0])) {
    const splitCsv = line => {
      const out = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            q = !q;
          }
        } else if (ch === "," && !q) {
          out.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    };
    const hdr = splitCsv(lines[0]).map(h => h.toLowerCase());
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsv(lines[i]);
      const row = {};
      hdr.forEach((h, idx) => {
        row[h] = cols[idx] || "";
      });
      if (row.question_text && row.option_a) out.push(row);
    }
    if (out.length) return out;
  }

  // 3) Plain text Q/A/B/C/D/Ans parser
  const blocks = txt.split(/\n(?=\s*(?:Q\.?\s*\d+|\d+[.)])\s+)/i);
  const parsed = [];
  for (const blk of blocks) {
    const bl = blk.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (bl.length < 5) continue;
    let qt = bl[0].replace(/^(?:Q\.?\s*\d+|\d+[.)])\s*/i, "").trim();
    const opts = {};
    let ans = "";
    let exp = "";
    for (let i = 1; i < bl.length; i++) {
      const l = bl[i];
      const mOpt = l.match(/^\(?([A-D])\)?[.):-]\s*(.+)$/i);
      const mAns = l.match(/^(?:Ans(?:wer)?|Correct)\s*[:\-]\s*\(?([A-D])\)?/i);
      const mExp = l.match(/^(?:Exp(?:lanation)?|Sol(?:ution)?)\s*[:\-]\s*(.+)$/i);
      if (mOpt) opts[mOpt[1].toUpperCase()] = mOpt[2].trim();
      else if (mAns) ans = mAns[1].toUpperCase();
      else if (mExp) exp = mExp[1].trim();
      else if (!opts.A) qt += " " + l;
    }
    if (qt && opts.A && opts.B && opts.C && opts.D && ["A", "B", "C", "D"].includes(ans)) {
      parsed.push({
        question_text: qt,
        option_a: opts.A,
        option_b: opts.B,
        option_c: opts.C,
        option_d: opts.D,
        correct_option: ans,
        explanation: exp
      });
    }
  }
  return parsed;
}
