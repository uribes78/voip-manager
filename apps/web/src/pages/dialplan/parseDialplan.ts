export interface ParsedLine {
  exten: string;
  priority: number;
  app: string;
  appdata: string;
}

export interface ParseResult {
  lines: ParsedLine[];
  errors: string[];
}

/**
 * Parsea texto estilo extensions.conf:
 *   exten => 1001,1,Dial(PJSIP/1001,30)
 *   same => n,Hangup()
 *   exten => _1XXX,1,NoOp(patrón)
 * Las prioridades `n` se convierten en incrementales; se ignoran comentarios y `[contexto]`.
 */
export function parseDialplan(text: string): ParseResult {
  const lines: ParsedLine[] = [];
  const errors: string[] = [];
  let currentExten: string | null = null;
  let lastPriority = 0;

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line || line.startsWith('[')) return;

    const m = /^(exten|same)\s*=>?\s*(.+)$/i.exec(line);
    if (!m) {
      errors.push(`Línea ${idx + 1}: formato no reconocido`);
      return;
    }
    const keyword = m[1]!.toLowerCase();
    let rest = m[2]!;
    let exten: string;

    if (keyword === 'exten') {
      const comma = rest.indexOf(',');
      if (comma < 0) {
        errors.push(`Línea ${idx + 1}: falta la prioridad`);
        return;
      }
      exten = rest.slice(0, comma).trim();
      rest = rest.slice(comma + 1);
      if (exten !== currentExten) {
        currentExten = exten;
        lastPriority = 0;
      }
    } else {
      if (!currentExten) {
        errors.push(`Línea ${idx + 1}: "same" sin un "exten" previo`);
        return;
      }
      exten = currentExten;
    }

    const comma2 = rest.indexOf(',');
    const prioRaw = (comma2 < 0 ? rest : rest.slice(0, comma2)).trim();
    const appPart = comma2 < 0 ? '' : rest.slice(comma2 + 1).trim();

    let priority: number;
    if (/^n$/i.test(prioRaw)) priority = lastPriority + 1;
    else if (/^\d+$/.test(prioRaw)) priority = Number(prioRaw);
    else if (/^hint$/i.test(prioRaw)) {
      errors.push(`Línea ${idx + 1}: los hints no se soportan en realtime, se omite`);
      return;
    } else {
      errors.push(`Línea ${idx + 1}: prioridad inválida "${prioRaw}"`);
      return;
    }
    lastPriority = priority;

    // Separa App(args); también acepta App sin paréntesis.
    const appMatch = /^([A-Za-z_][\w]*)\s*(?:\((.*)\))?\s*$/.exec(appPart);
    if (!appMatch) {
      errors.push(`Línea ${idx + 1}: aplicación inválida "${appPart}"`);
      return;
    }
    lines.push({ exten, priority, app: appMatch[1]!, appdata: appMatch[2] ?? '' });
  });

  return { lines, errors };
}

export function formatDialplan(context: string, lines: ParsedLine[]): string {
  const out = [`[${context}]`];
  let last: string | null = null;
  for (const l of [...lines].sort((a, b) => a.exten.localeCompare(b.exten) || a.priority - b.priority)) {
    const prefix = l.exten === last ? 'same  => n' : `exten => ${l.exten},${l.priority}`;
    out.push(`${prefix},${l.app}(${l.appdata})`);
    last = l.exten;
  }
  return out.join('\n');
}
