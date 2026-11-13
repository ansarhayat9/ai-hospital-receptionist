// Prepare Request: the topic the caller asked about
const raw = ($input.first().json.body) || {};
return [{ json: { topic: clean(raw.topic).toLowerCase().slice(0, 100) } }];
