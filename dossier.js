// dossier.js — pure functions over people and their connections. No UI code here.

export function addPerson(data, person) {
  data.dossier.push(person);
}

export function updatePerson(data, id, updates) {
  const p = data.dossier.find((x) => x.id === id);
  if (p) Object.assign(p, updates);
}

export function deletePerson(data, id) {
  data.dossier = data.dossier.filter((p) => p.id !== id);
  data.links = data.links.filter((l) => l.a !== id && l.b !== id);
}

export function personById(data, id) {
  return data.dossier.find((p) => p.id === id);
}

export function addLink(data, aId, bId) {
  if (aId === bId) return;
  const exists = data.links.some((l) => (l.a === aId && l.b === bId) || (l.a === bId && l.b === aId));
  if (exists) return;
  data.links.push({ id: crypto.randomUUID(), a: aId, b: bId });
}

export function removeLink(data, linkId) {
  data.links = data.links.filter((l) => l.id !== linkId);
}

export function linksForPerson(data, personId) {
  return data.links.filter((l) => l.a === personId || l.b === personId);
}

/** Every person connected to this one, paired with the link record (so it can be removed). */
export function connectedPeople(data, personId) {
  return linksForPerson(data, personId)
    .map((l) => {
      const otherId = l.a === personId ? l.b : l.a;
      return { link: l, person: personById(data, otherId) };
    })
    .filter((x) => x.person);
}

export function searchPeople(data, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.dossier.filter((p) =>
    p.name.toLowerCase().includes(q)
    || (p.location || '').toLowerCase().includes(q)
    || (p.traits || []).some((t) => t.toLowerCase().includes(q))
    || (p.mistakes || []).some((t) => t.toLowerCase().includes(q))
    || (p.notes || '').toLowerCase().includes(q));
}
