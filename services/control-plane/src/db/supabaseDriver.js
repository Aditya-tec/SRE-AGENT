const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function upsertService(name, fields) {
  const { error } = await supabase
    .from('services')
    .upsert({ name, ...fields }, { onConflict: 'name' });
  if (error) throw error;
}

async function listServices() {
  const { data, error } = await supabase.from('services').select('*').order('name');
  if (error) throw error;
  return data;
}

async function insertMetricsSnapshot(snapshot) {
  const { error } = await supabase.from('metrics_snapshots').insert(snapshot);
  if (error) throw error;
}

async function deleteOldSnapshots() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('metrics_snapshots').delete().lt('recorded_at', cutoff);
  if (error) throw error;
}

async function getRecentSnapshots(serviceName, limit = 12) {
  const { data, error } = await supabase
    .from('metrics_snapshots')
    .select('*')
    .eq('service_name', serviceName)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function getUnresolvedIncident(serviceName) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('service_name', serviceName)
    .is('resolved_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertIncident(incident) {
  const { data, error } = await supabase.from('incidents').insert(incident).select().single();
  if (error) throw error;
  return data;
}

async function updateIncident(id, fields) {
  const { data, error } = await supabase.from('incidents').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function listIncidents(limit = 20) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function getIncident(id) {
  const { data, error } = await supabase.from('incidents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function countRecentIncidents(serviceName, sinceIso) {
  const { count, error } = await supabase
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('service_name', serviceName)
    .gte('detected_at', sinceIso);
  if (error) throw error;
  return count || 0;
}

module.exports = {
  upsertService,
  listServices,
  insertMetricsSnapshot,
  deleteOldSnapshots,
  getRecentSnapshots,
  getUnresolvedIncident,
  insertIncident,
  updateIncident,
  listIncidents,
  getIncident,
  countRecentIncidents,
};
