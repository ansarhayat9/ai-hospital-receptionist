// Find Answer: pick the best matching row of the Hospital_Info sheet (columns: topic, keywords, answer)
const topic = $('Prepare Request').first().json.topic;
const rows = $input.all().map(i => i.json).filter(r => clean(r.topic) && clean(r.answer));
const reply = obj => [{ json: { response: obj } }];
const topics = rows.map(r => clean(r.topic));

if (!topic) return reply({ status: 'invalid', available_topics: topics, message: 'Ask the caller what they would like to know.' });

// Whole-word match only, so a short keyword such as "er" cannot match inside "helicopter"
const hasPhrase = (text, phrase) => phrase.length > 0 &&
  new RegExp('(^|[^a-z0-9])' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(text);
const words = topic.split(/[^a-z0-9]+/).filter(w => w.length > 2);
let best = null;
let bestScore = 0;
for (const r of rows) {
  const phrases = (clean(r.topic) + ',' + clean(r.keywords)).toLowerCase().split(',').map(p => p.trim()).filter(Boolean);
  let score = 0;
  for (const p of phrases) {
    if (p === topic) score += 5;
    else if (hasPhrase(topic, p) || hasPhrase(p, topic)) score += 3;
    else if (words.some(w => p.split(/[^a-z0-9]+/).includes(w))) score += 1;
  }
  if (score > bestScore) { bestScore = score; best = r; }
}
if (best && bestScore >= 2) {
  return reply({ status: 'ok', topic: clean(best.topic), answer: clean(best.answer), message: clean(best.answer) });
}
return reply({ status: 'not_found', available_topics: topics, message: 'There is no information on that topic. Tell the caller and offer a callback request. Topics available: ' + topics.join(', ') + '.' });
