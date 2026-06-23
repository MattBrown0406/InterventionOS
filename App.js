import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { hasSupabaseConfig } from "./src/lib/supabase";

const todayISODate = "2026-06-23";

const seedFamilies = [
  {
    id: "hayes",
    name: "Hayes family",
    type: "intervention",
    meta: "Intervention prep - Austin, TX",
    status: "Urgent",
    participants: "Mother: primary caller\nSister: letter drafted\nSpouse: needs coaching",
    contact: "Mary Hayes\n(512) 555-0148\nmary@example.com",
    notes: "Family is aligned on treatment but worried about refusal.",
    focus: "Residential dual-diagnosis program\nBackup detox option",
    documents: ["Mother letter", "Sister letter", "Script outline"],
    amount: 0,
    paymentStatus: "pending",
    archived: false
  },
  {
    id: "martin",
    name: "Martin parents",
    type: "coaching",
    meta: "Coaching - week 6 of 12",
    status: "Stable",
    participants: "Mother and father\nAdult daughter: no contact",
    contact: "Carol Martin\n(303) 555-0182\ncarol@example.com",
    notes: "Parents are holding boundaries more consistently.",
    focus: "Boundary language\nFinancial request response plan",
    documents: ["Boundary script", "Call notes"],
    amount: 0,
    paymentStatus: "received",
    archived: false
  }
];

const seedSchedule = [
  { id: "daily", title: "Daily case review", family: "Internal", time: "8:15", note: "review overnight updates" },
  { id: "hayes-prep", title: "Hayes intervention prep", family: "Hayes family", time: "10:30", note: "father, sister, spouse" },
  { id: "martin", title: "Martin coaching", family: "Martin parents", time: "1:00", note: "boundaries and next steps" }
];

const seedTasks = [
  { id: "lodging", title: "Send lodging options to Rivera family", dueDate: todayISODate },
  { id: "speaker", title: "Confirm Hayes family speaker order", dueDate: todayISODate }
];

const baselineRevenue = {
  ytdCollected: 412480,
  ytdOwed: 41000,
  mtdCollected: 48600,
  mtdOwed: 15500,
  pendingCount: 5
};

function money(value, compact = false) {
  if (compact && value >= 1000) {
    const short = value / 1000;
    return `$${Number.isInteger(short) ? short.toFixed(0) : short.toFixed(1)}k`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NF";
}

export default function App() {
  const [tab, setTab] = useState("today");
  const [families, setFamilies] = useState(seedFamilies);
  const [caseFilter, setCaseFilter] = useState("intervention");
  const [expandedCase, setExpandedCase] = useState("hayes");
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState("schedule");
  const [scheduleItems, setScheduleItems] = useState(seedSchedule);
  const [tasks, setTasks] = useState(seedTasks);
  const [familyForm, setFamilyForm] = useState({
    name: "",
    type: "intervention",
    contact: "",
    meta: "",
    notes: "",
    amount: "",
    paymentStatus: "pending"
  });
  const [entryForm, setEntryForm] = useState({
    entryType: "schedule",
    title: "",
    family: "",
    time: "09:00",
    dueDate: todayISODate,
    note: ""
  });

  const activeFamilies = families.filter((family) => !family.archived);
  const visibleFamilies = activeFamilies.filter((family) => family.type === caseFilter);
  const archivedFamilies = families.filter((family) => family.archived);
  const todayTasks = tasks.filter((task) => task.dueDate === todayISODate);

  const revenue = useMemo(() => {
    const caseRevenue = families.filter((family) => Number(family.amount) > 0);
    const received = caseRevenue
      .filter((family) => family.paymentStatus === "received")
      .reduce((sum, family) => sum + Number(family.amount), 0);
    const pending = caseRevenue
      .filter((family) => family.paymentStatus === "pending")
      .reduce((sum, family) => sum + Number(family.amount), 0);
    const avg = caseRevenue.length
      ? caseRevenue.reduce((sum, family) => sum + Number(family.amount), 0) / caseRevenue.length
      : 18700;

    return {
      ytdCollected: baselineRevenue.ytdCollected + received,
      ytdOwed: baselineRevenue.ytdOwed + pending,
      mtdCollected: baselineRevenue.mtdCollected + received,
      mtdOwed: baselineRevenue.mtdOwed + pending,
      pendingCount: baselineRevenue.pendingCount + caseRevenue.filter((family) => family.paymentStatus === "pending").length,
      avg
    };
  }, [families]);

  function openPlus() {
    if (tab === "cases") {
      setFamilyForm((current) => ({ ...current, type: caseFilter }));
      setShowFamilyForm(true);
      return;
    }

    if (tab === "schedule") {
      setEntryForm((current) => ({ ...current, entryType: scheduleFilter }));
      setShowEntryForm(true);
    }
  }

  function createFamily() {
    if (!familyForm.name.trim()) return;

    const id = `${Date.now()}`;
    const newFamily = {
      id,
      name: familyForm.name.trim(),
      type: familyForm.type,
      meta: familyForm.meta || "New intake",
      status: "New",
      participants: "Add family members and roles",
      contact: familyForm.contact || "Primary contact pending",
      notes: familyForm.notes || "Initial intake created.",
      focus: familyForm.type === "intervention" ? "Add treatment recommendations" : "Add coaching focus",
      documents: ["Add documents"],
      amount: Number(familyForm.amount || 0),
      paymentStatus: familyForm.paymentStatus,
      archived: false
    };

    setFamilies((items) => [...items, newFamily]);
    setCaseFilter(newFamily.type);
    setExpandedCase(id);
    setShowFamilyForm(false);
    setFamilyForm({ name: "", type: "intervention", contact: "", meta: "", notes: "", amount: "", paymentStatus: "pending" });
  }

  function createScheduleEntry() {
    if (!entryForm.title.trim()) return;
    const id = `${Date.now()}`;

    if (entryForm.entryType === "task") {
      setTasks((items) => [...items, { id, title: entryForm.title, dueDate: entryForm.dueDate }]);
      setScheduleFilter("task");
    } else {
      setScheduleItems((items) => [
        ...items,
        {
          id,
          title: entryForm.title,
          family: entryForm.family || "General",
          time: entryForm.time || "9:00",
          note: `${entryForm.note || "Calendar item"} - Google Calendar sync queued`
        }
      ]);
      setScheduleFilter("schedule");
    }

    setShowEntryForm(false);
    setEntryForm({ entryType: "schedule", title: "", family: "", time: "09:00", dueDate: todayISODate, note: "" });
  }

  function updateFamily(id, patch) {
    setFamilies((items) => items.map((family) => (family.id === id ? { ...family, ...patch } : family)));
  }

  function renderToday() {
    return (
      <ScrollView style={styles.panel}>
        <View style={styles.metrics}>
          <Metric label="Active cases" value={activeFamilies.length} note="current families" />
          <Metric label="Today" value={scheduleItems.length} note="appointments" />
          <Metric label="Open tasks" value={tasks.length} note={`${todayTasks.length} due today`} />
          <Metric label="YTD revenue" value={money(revenue.ytdCollected, true)} note={`${money(revenue.ytdOwed, true)} owed`} />
        </View>
        <SectionTitle title="Next up" />
        {scheduleItems.slice(0, 2).map((item) => <Appointment key={item.id} item={item} />)}
        <SectionTitle title="Needs attention" />
        {todayTasks.map((task) => (
          <Row key={task.id} label={task.title} value="Due" tone="rose" />
        ))}
      </ScrollView>
    );
  }

  function renderCases() {
    return (
      <ScrollView style={styles.panel}>
        <SectionTitle title="Case pipeline" />
        <Segmented
          options={[
            { key: "intervention", label: `Intervention - ${activeFamilies.filter((item) => item.type === "intervention").length}` },
            { key: "coaching", label: `Coaching - ${activeFamilies.filter((item) => item.type === "coaching").length}` }
          ]}
          value={caseFilter}
          onChange={setCaseFilter}
        />
        {showFamilyForm ? (
          <FormCard>
            <TextInput style={styles.input} placeholder="Family name" value={familyForm.name} onChangeText={(name) => setFamilyForm({ ...familyForm, name })} />
            <Segmented
              options={[
                { key: "intervention", label: "Intervention" },
                { key: "coaching", label: "Coaching" }
              ]}
              value={familyForm.type}
              onChange={(type) => setFamilyForm({ ...familyForm, type })}
            />
            <TextInput style={styles.input} placeholder="Primary contact" value={familyForm.contact} onChangeText={(contact) => setFamilyForm({ ...familyForm, contact })} />
            <TextInput style={styles.input} placeholder="Location/status" value={familyForm.meta} onChangeText={(meta) => setFamilyForm({ ...familyForm, meta })} />
            <TextInput style={styles.input} placeholder="Case amount" keyboardType="numeric" value={familyForm.amount} onChangeText={(amount) => setFamilyForm({ ...familyForm, amount })} />
            <Segmented
              options={[
                { key: "pending", label: "Pending" },
                { key: "received", label: "Received" }
              ]}
              value={familyForm.paymentStatus}
              onChange={(paymentStatus) => setFamilyForm({ ...familyForm, paymentStatus })}
            />
            <TextInput style={styles.input} placeholder="Starting note" value={familyForm.notes} onChangeText={(notes) => setFamilyForm({ ...familyForm, notes })} />
            <FormActions onSave={createFamily} onCancel={() => setShowFamilyForm(false)} saveLabel="Create family" />
          </FormCard>
        ) : null}
        {visibleFamilies.map((family) => <CaseCard key={family.id} family={family} expanded={expandedCase === family.id} onExpand={() => setExpandedCase(expandedCase === family.id ? "" : family.id)} onUpdate={updateFamily} />)}
      </ScrollView>
    );
  }

  function renderSchedule() {
    return (
      <ScrollView style={styles.panel}>
        {showEntryForm ? (
          <FormCard>
            <Segmented
              options={[
                { key: "schedule", label: "Schedule" },
                { key: "task", label: "Task" }
              ]}
              value={entryForm.entryType}
              onChange={(entryType) => setEntryForm({ ...entryForm, entryType })}
            />
            <TextInput style={styles.input} placeholder="Title" value={entryForm.title} onChangeText={(title) => setEntryForm({ ...entryForm, title })} />
            <TextInput style={styles.input} placeholder="Family or contact" value={entryForm.family} onChangeText={(family) => setEntryForm({ ...entryForm, family })} />
            <TextInput style={styles.input} placeholder="Time" value={entryForm.time} onChangeText={(time) => setEntryForm({ ...entryForm, time })} />
            <TextInput style={styles.input} placeholder="Due date for tasks" value={entryForm.dueDate} onChangeText={(dueDate) => setEntryForm({ ...entryForm, dueDate })} />
            <TextInput style={styles.input} placeholder="Note" value={entryForm.note} onChangeText={(note) => setEntryForm({ ...entryForm, note })} />
            <FormActions onSave={createScheduleEntry} onCancel={() => setShowEntryForm(false)} saveLabel="Create item" />
          </FormCard>
        ) : null}
        <Segmented
          options={[
            { key: "schedule", label: `Schedule - ${scheduleItems.length}` },
            { key: "task", label: `Tasks - ${tasks.length}` }
          ]}
          value={scheduleFilter}
          onChange={setScheduleFilter}
        />
        {scheduleFilter === "schedule" ? scheduleItems.map((item) => <Appointment key={item.id} item={item} />) : tasks.map((task) => <Row key={task.id} label={task.title} value={task.dueDate === todayISODate ? "Due today" : task.dueDate} tone={task.dueDate === todayISODate ? "rose" : "blue"} />)}
      </ScrollView>
    );
  }

  function renderRevenue() {
    return (
      <ScrollView style={styles.panel}>
        <View style={styles.revenueCard}>
          <Text style={styles.small}>Year-to-date collected</Text>
          <Text style={styles.bigMoney}>{money(revenue.ytdCollected)}</Text>
          <Text style={styles.muted}>{money(revenue.ytdOwed, true)} owed</Text>
        </View>
        <View style={styles.metrics}>
          <Metric label="MTD collected" value={money(revenue.mtdCollected, true)} note="received this month" />
          <Metric label="MTD owed" value={money(revenue.mtdOwed, true)} note="pending this month" />
          <Metric label="YTD owed" value={money(revenue.ytdOwed, true)} note={`${revenue.pendingCount} pending`} />
          <Metric label="Avg case value" value={money(revenue.avg, true)} note="active year" />
        </View>
      </ScrollView>
    );
  }

  function renderAdmin() {
    return (
      <ScrollView style={styles.panel}>
        <SectionTitle title="Integrations" />
        <Row label="Supabase" value={hasSupabaseConfig ? "Configured" : "Missing"} tone={hasSupabaseConfig ? "green" : "rose"} />
        <Row label="Google Calendar sync" value="On" tone="green" />
        <Row label="Push notifications" value="Ready" tone="blue" />
        <SectionTitle title="Archived families" />
        {archivedFamilies.length ? archivedFamilies.map((family) => (
          <FormCard key={family.id}>
            <Text style={styles.cardTitle}>{family.name}</Text>
            <Text style={styles.muted}>{family.meta}</Text>
            <TouchableOpacity style={styles.actionButton} onPress={() => updateFamily(family.id, { archived: false })}>
              <Text style={styles.actionText}>Restore to active</Text>
            </TouchableOpacity>
          </FormCard>
        )) : <Text style={styles.empty}>Archived families will appear here.</Text>}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{tab[0].toUpperCase() + tab.slice(1)}</Text>
        </View>
        <Text style={styles.date}>Tuesday, June 23</Text>
      </View>
      <View style={styles.toolbar}>
        <Text style={styles.search}>Search families, cases, notes</Text>
        <TouchableOpacity style={styles.plus} onPress={openPlus}>
          <Text style={styles.plusText}>+</Text>
        </TouchableOpacity>
      </View>
      {tab === "today" && renderToday()}
      {tab === "cases" && renderCases()}
      {tab === "schedule" && renderSchedule()}
      {tab === "revenue" && renderRevenue()}
      {tab === "admin" && renderAdmin()}
      <View style={styles.tabs}>
        {["today", "cases", "schedule", "revenue", "admin"].map((item) => (
          <TouchableOpacity key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => setTab(item)}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function CaseCard({ family, expanded, onExpand, onUpdate }) {
  const isIntervention = family.type === "intervention";

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.caseHeader} onPress={onExpand}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(family.name)}</Text></View>
        <View style={styles.caseText}>
          <Text style={styles.cardTitle}>{family.name}</Text>
          <Text style={styles.muted}>{family.meta}</Text>
        </View>
        <Text style={styles.pill}>{family.status}</Text>
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.caseDetails}>
          <EditableBlock title="Participants" value={family.participants} onChange={(participants) => onUpdate(family.id, { participants })} multiline />
          <EditableBlock title="Contact" value={family.contact} onChange={(contact) => onUpdate(family.id, { contact })} multiline />
          <EditableBlock title="Case notes" value={family.notes} onChange={(notes) => onUpdate(family.id, { notes })} multiline />
          <View style={styles.detailBlock}>
            <Text style={styles.blockTitle}>Revenue</Text>
            <Row label="Case amount" value={family.amount ? money(family.amount) : "Amount not set"} />
            <Row label="Payment status" value={family.paymentStatus === "received" ? "Received" : "Pending"} tone={family.paymentStatus === "received" ? "green" : "gold"} />
          </View>
          <EditableBlock title={isIntervention ? "Treatment recommendations" : "Coaching focus"} value={family.focus} onChange={(focus) => onUpdate(family.id, { focus })} multiline />
          <DocumentsBlock family={family} onUpdate={onUpdate} />
          {isIntervention ? (
            <View style={styles.detailBlock}>
              <Text style={styles.blockTitle}>Case checklist</Text>
              {["Contract sent", "Contract signed and payment received", "Prep Call Completed", "Treatment Selected", "Intervention Date Set", "Intervention Completed"].map((item) => <Row key={item} label={item} value="Open" tone="blue" />)}
            </View>
          ) : null}
          <TouchableOpacity style={styles.actionButton} onPress={() => onUpdate(family.id, { type: isIntervention ? "coaching" : "intervention" })}>
            <Text style={styles.actionText}>{isIntervention ? "Move to Coaching" : "Move to Intervention"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.archiveButton]} onPress={() => onUpdate(family.id, { archived: true })}>
            <Text style={styles.archiveText}>Archive</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function DocumentsBlock({ family, onUpdate }) {
  const [draft, setDraft] = useState("");

  function addDocument() {
    if (!draft.trim()) return;
    onUpdate(family.id, { documents: [...family.documents, draft.trim()] });
    setDraft("");
  }

  return (
    <View style={styles.detailBlock}>
      <Text style={styles.blockTitle}>Documents</Text>
      <Text style={styles.muted}>Accepts Word, Excel, Pages, Numbers, and PDFs.</Text>
      <View style={styles.chips}>
        {family.documents.map((document, index) => <Text key={`${document}-${index}`} style={styles.docChip}>{document}</Text>)}
      </View>
      <TextInput style={styles.input} placeholder="Add document name" value={draft} onChangeText={setDraft} />
      <TouchableOpacity style={styles.actionButton} onPress={addDocument}>
        <Text style={styles.actionText}>Add document</Text>
      </TouchableOpacity>
    </View>
  );
}

function EditableBlock({ title, value, onChange, multiline }) {
  return (
    <View style={styles.detailBlock}>
      <Text style={styles.blockTitle}>{title}</Text>
      <TextInput style={[styles.input, multiline && styles.textArea]} value={value} onChangeText={onChange} multiline={multiline} />
    </View>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <TouchableOpacity key={option.key} style={[styles.segment, value === option.key && styles.segmentActive]} onPress={() => onChange(option.key)}>
          <Text style={[styles.segmentText, value === option.key && styles.segmentTextActive]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Metric({ label, value, note }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.muted}>{note}</Text>
    </View>
  );
}

function Appointment({ item }) {
  return (
    <View style={styles.appointment}>
      <Text style={styles.time}>{item.time}</Text>
      <View style={styles.caseText}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.muted}>{item.family} - {item.note}</Text>
      </View>
    </View>
  );
}

function Row({ label, value, tone }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone === "rose" && styles.rose, tone === "gold" && styles.gold, tone === "green" && styles.green, tone === "blue" && styles.blue]}>{value}</Text>
    </View>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function FormCard({ children }) {
  return <View style={styles.formCard}>{children}</View>;
}

function FormActions({ onSave, onCancel, saveLabel }) {
  return (
    <View style={styles.formActions}>
      <TouchableOpacity style={styles.actionButton} onPress={onSave}><Text style={styles.actionText}>{saveLabel}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f3ed" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 30, fontWeight: "800", color: "#17211d" },
  date: { fontSize: 12, fontWeight: "700", color: "#68736e", marginBottom: 5 },
  toolbar: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingVertical: 14 },
  search: { flex: 1, borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, color: "#68736e", backgroundColor: "#fffdf8", fontWeight: "700" },
  plus: { width: 44, borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf8" },
  plusText: { fontSize: 26, color: "#17211d" },
  panel: { flex: 1, paddingHorizontal: 16 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, backgroundColor: "#fffdf8" },
  metricValue: { fontSize: 28, fontWeight: "800", marginVertical: 8, color: "#17211d" },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#17211d", marginTop: 18, marginBottom: 10 },
  card: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, backgroundColor: "#fffdf8", marginBottom: 10 },
  caseHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#d9ebe3", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#2f6f5e", fontWeight: "900" },
  caseText: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#17211d" },
  muted: { fontSize: 12, color: "#68736e", fontWeight: "650" },
  pill: { fontSize: 11, fontWeight: "800", color: "#a64949", backgroundColor: "#f1dddd", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  caseDetails: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#dbe2de", paddingTop: 12, gap: 10 },
  detailBlock: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 10, backgroundColor: "#f6f3ed" },
  blockTitle: { fontSize: 13, fontWeight: "800", color: "#17211d", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 7, backgroundColor: "#fffdf8", padding: 10, color: "#17211d", fontWeight: "650", marginBottom: 8 },
  textArea: { minHeight: 82, textAlignVertical: "top" },
  row: { minHeight: 40, borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 10, backgroundColor: "#fffdf8", flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  rowLabel: { flex: 1, color: "#17211d", fontWeight: "750" },
  rowValue: { color: "#68736e", fontWeight: "800" },
  rose: { color: "#a64949" },
  gold: { color: "#a97321" },
  green: { color: "#2f6f5e" },
  blue: { color: "#2f5f8f" },
  actionButton: { borderRadius: 8, backgroundColor: "#d9ebe3", padding: 11, alignItems: "center" },
  actionText: { color: "#2f6f5e", fontWeight: "900" },
  archiveButton: { backgroundColor: "#f1dddd" },
  archiveText: { color: "#a64949", fontWeight: "900" },
  cancelButton: { borderRadius: 8, borderWidth: 1, borderColor: "#dbe2de", padding: 11, alignItems: "center" },
  cancelText: { color: "#68736e", fontWeight: "900" },
  formCard: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, backgroundColor: "#fffdf8", marginBottom: 10 },
  formActions: { flexDirection: "row", gap: 8 },
  segmented: { flexDirection: "row", gap: 4, borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 4, marginBottom: 10, backgroundColor: "#fffdf8" },
  segment: { flex: 1, minHeight: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: "#2f6f5e" },
  segmentText: { color: "#68736e", fontWeight: "850" },
  segmentTextActive: { color: "#fff" },
  appointment: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, backgroundColor: "#fffdf8", marginBottom: 10, flexDirection: "row", gap: 12, alignItems: "center" },
  time: { width: 64, textAlign: "center", paddingVertical: 16, backgroundColor: "#eef2ef", borderRadius: 8, fontWeight: "900", color: "#17211d" },
  revenueCard: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 14, backgroundColor: "#fffdf8", marginBottom: 10 },
  bigMoney: { fontSize: 34, fontWeight: "900", color: "#17211d", marginVertical: 8 },
  small: { color: "#68736e", fontSize: 12, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  docChip: { backgroundColor: "#dce8f5", color: "#2f5f8f", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, fontSize: 11, fontWeight: "850" },
  empty: { color: "#68736e", fontWeight: "700", padding: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#dbe2de", borderRadius: 8 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#dbe2de", padding: 8, backgroundColor: "#fffdf8" },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#d9ebe3" },
  tabText: { fontSize: 11, color: "#68736e", fontWeight: "800" },
  tabTextActive: { color: "#2f6f5e" }
});
