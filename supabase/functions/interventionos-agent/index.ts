import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-interventionos-agent-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AGENT_TOKEN = Deno.env.get("INTERVENTIONOS_AGENT_TOKEN") || Deno.env.get("HERMES_INTERVENTIONOS_TOKEN") || "";
const OWNER_USER_ID = Deno.env.get("INTERVENTIONOS_OWNER_USER_ID") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function assertAgentAccess(req: Request) {
  if (!AGENT_TOKEN) throw new Error("Agent token is not configured");
  const headerToken = req.headers.get("x-interventionos-agent-token") || "";
  const auth = req.headers.get("authorization") || "";
  const bearerToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (headerToken !== AGENT_TOKEN && bearerToken !== AGENT_TOKEN) {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    throw error;
  }
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function limit(value: unknown, fallback = 20) {
  const n = Number(value || fallback);
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 1), 100);
}

async function logAction(action: string, request: Record<string, unknown>, result: Record<string, unknown>, targetTable?: string, targetId?: string) {
  await supabase.from("agent_actions").insert({
    source: "hermes_telegram",
    action,
    target_table: targetTable || null,
    target_id: isUuid(targetId) ? targetId : null,
    request,
    result,
  });
}

async function listFamilies(args: Record<string, unknown>) {
  let query = supabase
    .from("families")
    .select("id,name,type,status,ip_name,primary_substance,meta,contact,notes,focus,participants,documents,checklist,amount,payment_status,archived,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit(args.limit));

  if (typeof args.archived === "boolean") query = query.eq("archived", args.archived);
  else query = query.eq("archived", false);
  if (args.type) query = query.eq("type", cleanText(args.type));
  if (args.search) query = query.ilike("name", `%${cleanText(args.search)}%`);

  const { data, error } = await query;
  if (error) throw error;
  return { families: data || [] };
}

async function getFamily(args: Record<string, unknown>) {
  if (!isUuid(args.id)) throw new Error("id is required");
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .eq("id", args.id)
    .single();
  if (error) throw error;
  return { family: data };
}

async function createFamily(args: Record<string, unknown>) {
  const payload = {
    name: cleanText(args.name, "Unnamed family"),
    type: cleanText(args.type, "intervention") || "intervention",
    status: cleanText(args.status, "New") || "New",
    ip_name: cleanText(args.ipName || args.ip_name),
    primary_substance: cleanText(args.primarySubstance || args.primary_substance),
    meta: cleanText(args.meta),
    contact: cleanText(args.contact),
    notes: cleanText(args.notes),
    focus: cleanText(args.focus),
    amount: cleanNumber(args.amount, 0),
    payment_status: cleanText(args.paymentStatus || args.payment_status, "pending") || "pending",
    archived: Boolean(args.archived),
    participants: Array.isArray(args.participants) ? args.participants : [],
    documents: Array.isArray(args.documents) ? args.documents : [],
    checklist: args.checklist && typeof args.checklist === "object" ? args.checklist : {},
    owner_id: isUuid(args.ownerId || args.owner_id) ? String(args.ownerId || args.owner_id) : OWNER_USER_ID || null,
  };

  const { data, error } = await supabase.from("families").insert(payload).select("*").single();
  if (error) throw error;
  return { family: data };
}

async function updateFamily(args: Record<string, unknown>) {
  if (!isUuid(args.id)) throw new Error("id is required");
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    name: "name",
    type: "type",
    status: "status",
    ipName: "ip_name",
    ip_name: "ip_name",
    primarySubstance: "primary_substance",
    primary_substance: "primary_substance",
    meta: "meta",
    contact: "contact",
    notes: "notes",
    focus: "focus",
    amount: "amount",
    paymentStatus: "payment_status",
    payment_status: "payment_status",
    archived: "archived",
  };
  for (const [inputKey, dbKey] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(args, inputKey)) patch[dbKey] = args[inputKey];
  }
  if (Array.isArray(args.participants)) patch.participants = args.participants;
  if (Array.isArray(args.documents)) patch.documents = args.documents;
  if (args.checklist && typeof args.checklist === "object") patch.checklist = args.checklist;
  if (!Object.keys(patch).length) throw new Error("No fields provided");

  const { data, error } = await supabase.from("families").update(patch).eq("id", args.id).select("*").single();
  if (error) throw error;
  return { family: data };
}

async function addCaseNote(args: Record<string, unknown>) {
  if (!isUuid(args.familyId || args.family_id)) throw new Error("familyId is required");
  const familyId = String(args.familyId || args.family_id);
  const note = cleanText(args.note);
  if (!note) throw new Error("note is required");

  const { data: family, error: readError } = await supabase.from("families").select("notes").eq("id", familyId).single();
  if (readError) throw readError;
  const timestamp = new Date().toISOString();
  const nextNotes = [family?.notes, `[${timestamp}] ${note}`].filter(Boolean).join("\n\n");
  const { data, error } = await supabase.from("families").update({ notes: nextNotes }).eq("id", familyId).select("*").single();
  if (error) throw error;
  return { family: data };
}

async function listSchedule(args: Record<string, unknown>) {
  let query = supabase
    .from("schedule_items")
    .select("*")
    .order("item_date", { ascending: true })
    .limit(limit(args.limit, 50));
  if (args.from) query = query.gte("item_date", cleanText(args.from));
  if (args.to) query = query.lte("item_date", cleanText(args.to));
  if (args.family) query = query.ilike("family_name", `%${cleanText(args.family)}%`);
  const { data, error } = await query;
  if (error) throw error;
  return { scheduleItems: data || [] };
}

async function createAppointment(args: Record<string, unknown>) {
  const itemDate = cleanText(args.date || args.item_date);
  const itemTime = cleanText(args.time || args.item_time, "09:00") || "09:00";
  const startsAt = itemDate ? new Date(`${itemDate}T${itemTime}:00`).toISOString() : null;
  const payload = {
    title: cleanText(args.title, "Untitled appointment"),
    family_name: cleanText(args.family || args.family_name, "General"),
    item_date: itemDate || null,
    item_time: itemTime,
    starts_at: startsAt,
    note: cleanText(args.note),
    owner_id: isUuid(args.ownerId || args.owner_id) ? String(args.ownerId || args.owner_id) : OWNER_USER_ID || null,
  };
  const { data, error } = await supabase.from("schedule_items").insert(payload).select("*").single();
  if (error) throw error;
  return { appointment: data };
}

async function listTasks(args: Record<string, unknown>) {
  let query = supabase.from("tasks").select("*").order("due_date", { ascending: true }).limit(limit(args.limit, 50));
  if (typeof args.completed === "boolean") query = query.eq("completed", args.completed);
  if (args.from) query = query.gte("due_date", cleanText(args.from));
  if (args.to) query = query.lte("due_date", cleanText(args.to));
  const { data, error } = await query;
  if (error) throw error;
  return { tasks: data || [] };
}

async function createTask(args: Record<string, unknown>) {
  const payload = {
    title: cleanText(args.title, "Untitled task"),
    family_name: cleanText(args.family || args.family_name),
    due_date: cleanText(args.dueDate || args.due_date) || null,
    note: cleanText(args.note),
    completed: Boolean(args.completed),
    owner_id: isUuid(args.ownerId || args.owner_id) ? String(args.ownerId || args.owner_id) : OWNER_USER_ID || null,
  };
  const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();
  if (error) throw error;
  return { task: data };
}

async function completeTask(args: Record<string, unknown>) {
  if (!isUuid(args.id)) throw new Error("id is required");
  const { data, error } = await supabase.from("tasks").update({ completed: true }).eq("id", args.id).select("*").single();
  if (error) throw error;
  return { task: data };
}

async function dashboard(args: Record<string, unknown>) {
  const [{ data: families }, { data: appointments }, { data: tasks }] = await Promise.all([
    supabase.from("families").select("id,type,archived,payment_status,amount,status").eq("archived", false),
    supabase.from("schedule_items").select("id,title,family_name,item_date,item_time,note").order("item_date", { ascending: true }).limit(limit(args.appointmentLimit, 10)),
    supabase.from("tasks").select("id,title,family_name,due_date,completed,note").eq("completed", false).order("due_date", { ascending: true }).limit(limit(args.taskLimit, 10)),
  ]);
  return {
    counts: {
      activeFamilies: families?.length || 0,
      interventions: families?.filter((f: { type?: string }) => f.type === "intervention").length || 0,
      coaching: families?.filter((f: { type?: string }) => f.type === "coaching").length || 0,
      openTasks: tasks?.length || 0,
    },
    nextAppointments: appointments || [],
    openTasks: tasks || [],
  };
}

const handlers: Record<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  dashboard,
  list_families: listFamilies,
  get_family: getFamily,
  create_family: createFamily,
  update_family: updateFamily,
  add_case_note: addCaseNote,
  list_schedule: listSchedule,
  create_appointment: createAppointment,
  list_tasks: listTasks,
  create_task: createTask,
  complete_task: completeTask,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    assertAgentAccess(req);
    body = await req.json();
    const action = cleanText(body.action);
    const args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>;
    const handler = handlers[action];
    if (!handler) throw new Error(`Unsupported action: ${action}`);

    const result = await handler(args);
    await logAction(action, args, result, undefined, isUuid(args.id) ? String(args.id) : undefined);
    return jsonResponse({ success: true, action, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 401 : 400;
    try {
      await logAction(cleanText(body.action, "unknown"), body, { success: false, error: message });
    } catch (_) {
      // Never let audit logging hide the real response.
    }
    return jsonResponse({ success: false, error: message }, status);
  }
});
