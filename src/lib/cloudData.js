import { hasSupabaseConfig, supabase } from "./supabase";

const FAMILY_COLUMNS = "id, local_id, name, type, status, ip_name, primary_substance, meta, participants, contact, notes, focus, documents, checklist, amount, payment_status, archived, updated_at";
const SCHEDULE_COLUMNS = "id, local_id, title, family_name, item_date, item_time, starts_at, note, google_event_id, updated_at";
const TASK_COLUMNS = "id, local_id, title, family_name, due_date, note, completed, google_event_id, updated_at";

export function canUseCloud() {
  return hasSupabaseConfig && Boolean(supabase);
}

function requireClient() {
  if (!canUseCloud()) throw new Error("Supabase is not configured");
  return supabase;
}

export async function getCurrentUser() {
  if (!canUseCloud()) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user || null;
}

export async function signInInterventionOS(email, password) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.user;
}

export async function signOutInterventionOS() {
  if (!canUseCloud()) return;
  await supabase.auth.signOut();
}

function cloudFamilyToLocal(row) {
  return {
    id: row.local_id || row.id,
    cloudId: row.id,
    name: row.name || "",
    type: row.type || "intervention",
    ipName: row.ip_name || "",
    primarySubstance: row.primary_substance || "",
    meta: row.meta || "",
    status: row.status || "New",
    participants: Array.isArray(row.participants) ? row.participants : [],
    contact: row.contact || "",
    notes: row.notes || "",
    focus: row.focus || "",
    documents: Array.isArray(row.documents) ? row.documents : [],
    checklist: row.checklist && typeof row.checklist === "object" ? row.checklist : {},
    updatedAt: row.updated_at || "",
    amount: Number(row.amount || 0),
    paymentStatus: row.payment_status || "pending",
    archived: Boolean(row.archived),
  };
}

function localFamilyToCloud(family, userId) {
  return {
    id: family.cloudId || (isUuid(family.id) ? family.id : undefined),
    local_id: String(family.id),
    owner_id: userId,
    name: family.name || "Unnamed family",
    type: family.type || "intervention",
    status: family.status || "New",
    ip_name: family.ipName || "",
    primary_substance: family.primarySubstance || "",
    meta: family.meta || "",
    participants: Array.isArray(family.participants) ? family.participants : [],
    contact: family.contact || "",
    notes: family.notes || "",
    focus: family.focus || "",
    documents: Array.isArray(family.documents) ? family.documents : [],
    checklist: family.checklist && typeof family.checklist === "object" ? family.checklist : {},
    amount: Number(family.amount || 0),
    payment_status: family.paymentStatus || "pending",
    archived: Boolean(family.archived),
  };
}

function cloudScheduleToLocal(row) {
  return {
    id: row.local_id || row.id,
    cloudId: row.id,
    title: row.title || "",
    family: row.family_name || "General",
    time: row.item_time || "09:00",
    date: row.item_date || "",
    note: row.note || "",
    googleEventId: row.google_event_id || "",
    updatedAt: row.updated_at || "",
  };
}

function localScheduleToCloud(item, userId) {
  return {
    id: item.cloudId || (isUuid(item.id) ? item.id : undefined),
    local_id: String(item.id),
    owner_id: userId,
    title: item.title || "Untitled appointment",
    family_name: item.family || "General",
    item_date: item.date || null,
    item_time: item.time || null,
    starts_at: buildStartsAt(item.date, item.time),
    note: item.note || "",
    google_event_id: item.googleEventId || "",
  };
}

function cloudTaskToLocal(row) {
  return {
    id: row.local_id || row.id,
    cloudId: row.id,
    title: row.title || "",
    family: row.family_name || "",
    dueDate: row.due_date || "",
    note: row.note || "",
    completed: Boolean(row.completed),
    googleEventId: row.google_event_id || "",
    updatedAt: row.updated_at || "",
  };
}

function localTaskToCloud(task, userId) {
  return {
    id: task.cloudId || (isUuid(task.id) ? task.id : undefined),
    local_id: String(task.id),
    owner_id: userId,
    title: task.title || "Untitled task",
    family_name: task.family || "",
    due_date: task.dueDate || null,
    note: task.note || "",
    completed: Boolean(task.completed),
    google_event_id: task.googleEventId || "",
  };
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildStartsAt(date, time) {
  if (!date) return null;
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time || "") ? time : "09:00";
  const parsed = new Date(`${date}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function loadCloudData() {
  const client = requireClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const [familiesRes, scheduleRes, tasksRes] = await Promise.all([
    client.from("families").select(FAMILY_COLUMNS).order("created_at", { ascending: true }),
    client.from("schedule_items").select(SCHEDULE_COLUMNS).order("item_date", { ascending: true }),
    client.from("tasks").select(TASK_COLUMNS).order("due_date", { ascending: true }),
  ]);

  if (familiesRes.error) throw familiesRes.error;
  if (scheduleRes.error) throw scheduleRes.error;
  if (tasksRes.error) throw tasksRes.error;

  return {
    families: (familiesRes.data || []).map(cloudFamilyToLocal),
    scheduleItems: (scheduleRes.data || []).map(cloudScheduleToLocal),
    tasks: (tasksRes.data || []).map(cloudTaskToLocal),
    loadedAt: new Date().toISOString(),
  };
}

export async function saveCloudData({ families, scheduleItems, tasks }) {
  const client = requireClient();
  const user = await getCurrentUser();
  if (!user) return { skipped: true, reason: "not_signed_in" };

  const familyPayload = families.map((family) => localFamilyToCloud(family, user.id));
  const schedulePayload = scheduleItems.map((item) => localScheduleToCloud(item, user.id));
  const taskPayload = tasks.map((task) => localTaskToCloud(task, user.id));

  const results = await Promise.all([
    familyPayload.length
      ? client.from("families").upsert(familyPayload, { onConflict: "owner_id,local_id" }).select("id")
      : Promise.resolve({ error: null }),
    schedulePayload.length
      ? client.from("schedule_items").upsert(schedulePayload, { onConflict: "owner_id,local_id" }).select("id")
      : Promise.resolve({ error: null }),
    taskPayload.length
      ? client.from("tasks").upsert(taskPayload, { onConflict: "owner_id,local_id" }).select("id")
      : Promise.resolve({ error: null }),
  ]);

  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return { synced: true, syncedAt: new Date().toISOString() };
}
