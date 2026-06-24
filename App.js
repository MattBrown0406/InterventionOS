import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import { hasSupabaseConfig } from "./src/lib/supabase";

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const currentDate = new Date();
const todayISODate = toLocalISODate(currentDate);
const dateLabel = currentDate.toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric"
});

const seedFamilies = [];

const seedSchedule = [];

const seedTasks = [];

const baselineRevenue = {
  ytdCollected: 0,
  ytdOwed: 0,
  mtdCollected: 0,
  mtdOwed: 0,
  pendingCount: 0
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

function calendarName(calendar) {
  const sourceName = calendar.source?.name ? ` - ${calendar.source.name}` : "";
  return `${calendar.title}${sourceName}`;
}

function isGoogleCalendar(calendar) {
  const haystack = `${calendar.title} ${calendar.source?.name || ""} ${calendar.source?.type || ""}`.toLowerCase();
  return haystack.includes("google") || haystack.includes("gmail");
}

function parseDate(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTime(timeText) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!match) return { hours: 9, minutes: 0 };

  return {
    hours: Math.min(Number(match[1]), 23),
    minutes: Math.min(Number(match[2]), 59)
  };
}

function participantTemplate() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    role: "",
    phone: "",
    email: "",
    notes: "",
    contactId: "",
    syncStatus: "Not synced"
  };
}

function normalizeParticipants(participants) {
  return Array.isArray(participants) ? participants : [];
}

function participantContact(participant, familyName) {
  const nameParts = participant.name.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || participant.name.trim();
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  return {
    [Contacts.Fields.FirstName]: firstName,
    [Contacts.Fields.LastName]: lastName,
    [Contacts.Fields.Name]: participant.name.trim(),
    [Contacts.Fields.Company]: familyName,
    [Contacts.Fields.JobTitle]: participant.role.trim(),
    [Contacts.Fields.PhoneNumbers]: participant.phone.trim()
      ? [{ label: "mobile", number: participant.phone.trim(), isPrimary: true }]
      : [],
    [Contacts.Fields.Emails]: participant.email.trim()
      ? [{ label: "work", email: participant.email.trim(), isPrimary: true }]
      : []
  };
}

export default function App() {
  const [tab, setTab] = useState("today");
  const [families, setFamilies] = useState(seedFamilies);
  const [caseFilter, setCaseFilter] = useState("intervention");
  const [expandedCase, setExpandedCase] = useState("");
  const [showFamilyForm, setShowFamilyForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState("schedule");
  const [scheduleItems, setScheduleItems] = useState(seedSchedule);
  const [tasks, setTasks] = useState(seedTasks);
  const [calendarPermission, setCalendarPermission] = useState("unknown");
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [calendarMessage, setCalendarMessage] = useState("Not connected");
  const [contactsPermission, setContactsPermission] = useState("unknown");
  const [contactsMessage, setContactsMessage] = useState("Not connected");
  const [familyForm, setFamilyForm] = useState({
    name: "",
    type: "intervention",
    ipName: "",
    primarySubstance: "",
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
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId);
  const calendarReady = calendarPermission === "granted" && Boolean(selectedCalendarId);
  const contactsReady = contactsPermission === "granted";
  const activeParticipants = activeFamilies.flatMap((family) =>
    normalizeParticipants(family.participants).map((participant) => ({ ...participant, familyId: family.id, familyName: family.name }))
  );

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
      : 0;

    return {
      ytdCollected: baselineRevenue.ytdCollected + received,
      ytdOwed: baselineRevenue.ytdOwed + pending,
      mtdCollected: baselineRevenue.mtdCollected + received,
      mtdOwed: baselineRevenue.mtdOwed + pending,
      pendingCount: baselineRevenue.pendingCount + caseRevenue.filter((family) => family.paymentStatus === "pending").length,
      avg
    };
  }, [families]);

  useEffect(() => {
    refreshCalendars(false);
    refreshContacts(false);
  }, []);

  async function refreshContacts(requestAccess = false) {
    try {
      const permission = requestAccess
        ? await Contacts.requestPermissionsAsync()
        : await Contacts.getPermissionsAsync();

      setContactsPermission(permission.status);
      setContactsMessage(permission.status === "granted" ? "Ready to sync" : requestAccess ? "Contacts access was not approved" : "Not connected");
    } catch (error) {
      setContactsMessage("Contacts setup needs attention");
    }
  }

  async function refreshCalendars(requestAccess = false) {
    try {
      const permission = requestAccess
        ? await Calendar.requestCalendarPermissionsAsync()
        : await Calendar.getCalendarPermissionsAsync();

      setCalendarPermission(permission.status);

      if (permission.status !== "granted") {
        setCalendars([]);
        setSelectedCalendarId("");
        setCalendarMessage(requestAccess ? "Calendar access was not approved" : "Not connected");
        return;
      }

      const availableCalendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writableCalendars = availableCalendars.filter((calendar) => calendar.allowsModifications !== false);
      const preferredCalendar = writableCalendars.find(isGoogleCalendar) || writableCalendars[0];

      setCalendars(writableCalendars);
      setSelectedCalendarId((current) => {
        if (writableCalendars.some((calendar) => calendar.id === current)) return current;
        return preferredCalendar?.id || "";
      });
      setCalendarMessage(preferredCalendar ? "Ready to sync" : "No writable calendars found");
    } catch (error) {
      setCalendarMessage("Calendar setup needs attention");
    }
  }

  async function syncEntryToCalendar(entry) {
    if (!calendarReady) {
      setCalendarMessage("Choose a calendar in Admin");
      return { eventId: "", note: "Calendar setup needed" };
    }

    const date = parseDate(entry.dueDate);
    if (!date) {
      setCalendarMessage("Use dates as YYYY-MM-DD");
      return { eventId: "", note: "Calendar sync needs valid date" };
    }

    try {
      if (entry.entryType === "task") {
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        const eventId = await Calendar.createEventAsync(selectedCalendarId, {
          title: `Task: ${entry.title.trim()}`,
          notes: [entry.family, entry.note].filter(Boolean).join("\n"),
          startDate: date,
          endDate,
          allDay: true,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        setCalendarMessage("Task added to calendar");
        return { eventId, note: "Synced to calendar" };
      }

      const time = parseTime(entry.time);
      const startDate = new Date(date);
      startDate.setHours(time.hours, time.minutes, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);

      const eventId = await Calendar.createEventAsync(selectedCalendarId, {
        title: entry.title.trim(),
        location: entry.family,
        notes: entry.note,
        startDate,
        endDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        alarms: [{ relativeOffset: -15 }]
      });
      setCalendarMessage("Appointment added to calendar");
      return { eventId, note: "Synced to calendar" };
    } catch (error) {
      setCalendarMessage("Calendar sync failed");
      return { eventId: "", note: "Calendar sync failed" };
    }
  }

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
      ipName: familyForm.ipName.trim(),
      primarySubstance: familyForm.primarySubstance.trim(),
      meta: familyForm.meta,
      status: "New",
      participants: [],
      contact: familyForm.contact,
      notes: familyForm.notes,
      focus: "",
      documents: [],
      amount: Number(familyForm.amount || 0),
      paymentStatus: familyForm.paymentStatus,
      archived: false
    };

    setFamilies((items) => [...items, newFamily]);
    setCaseFilter(newFamily.type);
    setExpandedCase(id);
    setShowFamilyForm(false);
    setFamilyForm({ name: "", type: "intervention", ipName: "", primarySubstance: "", contact: "", meta: "", notes: "", amount: "", paymentStatus: "pending" });
  }

  async function createScheduleEntry() {
    if (!entryForm.title.trim()) return;
    const id = `${Date.now()}`;
    const syncResult = await syncEntryToCalendar(entryForm);

    if (entryForm.entryType === "task") {
      setTasks((items) => [...items, { id, title: entryForm.title, dueDate: entryForm.dueDate, googleEventId: syncResult.eventId }]);
      setScheduleFilter("task");
    } else {
      setScheduleItems((items) => [
        ...items,
        {
          id,
          title: entryForm.title,
          family: entryForm.family || "General",
          time: entryForm.time || "9:00",
          date: entryForm.dueDate,
          note: `${entryForm.note || "Calendar item"} - ${syncResult.note}`,
          googleEventId: syncResult.eventId
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
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
        <View style={styles.metrics}>
          <Metric label="Active cases" value={activeFamilies.length} note="current families" />
          <Metric label="Today" value={scheduleItems.length} note="appointments" />
          <Metric label="Open tasks" value={tasks.length} note={`${todayTasks.length} due today`} />
          <Metric label="YTD revenue" value={money(revenue.ytdCollected, true)} note={`${money(revenue.ytdOwed, true)} owed`} />
        </View>
        <SectionTitle title="Next up" />
        {scheduleItems.slice(0, 2).map((item) => <Appointment key={item.id} item={item} />)}
        {!scheduleItems.length ? <Text style={styles.empty}>No appointments scheduled.</Text> : null}
        <SectionTitle title="Needs attention" />
        {todayTasks.map((task) => (
          <Row key={task.id} label={task.title} value="Due" tone="rose" />
        ))}
        {!todayTasks.length ? <Text style={styles.empty}>No tasks due today.</Text> : null}
      </ScrollView>
    );
  }

  function renderCases() {
    return (
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
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
            <TextInput style={styles.input} placeholder="IP name" value={familyForm.ipName} onChangeText={(ipName) => setFamilyForm({ ...familyForm, ipName })} />
            <TextInput style={styles.input} placeholder="Primary substance used" value={familyForm.primarySubstance} onChangeText={(primarySubstance) => setFamilyForm({ ...familyForm, primarySubstance })} />
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
        {visibleFamilies.map((family) => <CaseCard key={family.id} family={family} expanded={expandedCase === family.id} onExpand={() => setExpandedCase(expandedCase === family.id ? "" : family.id)} onUpdate={updateFamily} onSyncParticipant={syncParticipantToContacts} contactsReady={contactsReady} />)}
        {!visibleFamilies.length ? <Text style={styles.empty}>No active {caseFilter} cases yet.</Text> : null}
      </ScrollView>
    );
  }

  function renderSchedule() {
    return (
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
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
            {entryForm.entryType === "schedule" ? <TextInput style={styles.input} placeholder="Time" value={entryForm.time} onChangeText={(time) => setEntryForm({ ...entryForm, time })} /> : null}
            <TextInput style={styles.input} placeholder={entryForm.entryType === "task" ? "Due date" : "Date"} value={entryForm.dueDate} onChangeText={(dueDate) => setEntryForm({ ...entryForm, dueDate })} />
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
        {scheduleFilter === "schedule" && !scheduleItems.length ? <Text style={styles.empty}>No schedule items yet.</Text> : null}
        {scheduleFilter === "task" && !tasks.length ? <Text style={styles.empty}>No tasks yet.</Text> : null}
      </ScrollView>
    );
  }

  function renderRevenue() {
    return (
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
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
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
        <SectionTitle title="Integrations" />
        <Row label="Supabase" value={hasSupabaseConfig ? "Configured" : "Missing"} tone={hasSupabaseConfig ? "green" : "rose"} />
        <Row label="Google Calendar sync" value={calendarReady ? "Ready" : "Needs setup"} tone={calendarReady ? "green" : "gold"} />
        <Row label="Selected calendar" value={selectedCalendar ? calendarName(selectedCalendar) : calendarMessage} tone={calendarReady ? "green" : "blue"} />
        <TouchableOpacity style={styles.actionButton} onPress={() => refreshCalendars(true)}>
          <Text style={styles.actionText}>{calendarPermission === "granted" ? "Refresh calendars" : "Connect calendar"}</Text>
        </TouchableOpacity>
        {calendars.length ? (
          <View style={styles.calendarList}>
            {calendars.map((calendar) => (
              <TouchableOpacity key={calendar.id} style={[styles.calendarChoice, selectedCalendarId === calendar.id && styles.calendarChoiceActive]} onPress={() => {
                setSelectedCalendarId(calendar.id);
                setCalendarMessage("Ready to sync");
              }}>
                <Text style={[styles.calendarChoiceText, selectedCalendarId === calendar.id && styles.calendarChoiceTextActive]}>{calendarName(calendar)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <Row label="Contacts sync" value={contactsReady ? "Ready" : "Needs setup"} tone={contactsReady ? "green" : "gold"} />
        <Row label="Active participants" value={`${activeParticipants.length}`} tone="blue" />
        <TouchableOpacity style={styles.actionButton} onPress={() => refreshContacts(true)}>
          <Text style={styles.actionText}>{contactsReady ? "Refresh contacts access" : "Connect contacts"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, !contactsReady && styles.disabledButton]} onPress={syncAllParticipantsToContacts}>
          <Text style={styles.actionText}>Sync active participants</Text>
        </TouchableOpacity>
        <Text style={styles.syncNote}>{contactsMessage}</Text>
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

  async function syncParticipantToContacts(familyId, participantId) {
    const family = families.find((item) => item.id === familyId);
    const participant = normalizeParticipants(family?.participants).find((item) => item.id === participantId);

    if (!family || !participant?.name.trim()) return;

    if (!contactsReady) {
      setContactsMessage("Connect contacts in Admin first");
      updateParticipant(familyId, participantId, { syncStatus: "Contacts setup needed" });
      return;
    }

    try {
      const contact = participantContact(participant, family.name);
      let contactId = participant.contactId;

      if (contactId) {
        try {
          contactId = await Contacts.updateContactAsync({ ...contact, id: contactId });
        } catch (error) {
          contactId = await Contacts.addContactAsync(contact);
        }
      } else {
        contactId = await Contacts.addContactAsync(contact);
      }

      updateParticipant(familyId, participantId, { contactId, syncStatus: "Synced" });
      setContactsMessage("Participant synced to Contacts");
    } catch (error) {
      updateParticipant(familyId, participantId, { syncStatus: "Sync failed" });
      setContactsMessage("Contacts sync failed");
    }
  }

  async function syncAllParticipantsToContacts() {
    if (!contactsReady) {
      setContactsMessage("Connect contacts first");
      return;
    }

    for (const participant of activeParticipants) {
      if (participant.name.trim()) {
        await syncParticipantToContacts(participant.familyId, participant.id);
      }
    }
  }

  function updateParticipant(familyId, participantId, patch) {
    setFamilies((items) => items.map((family) => {
      if (family.id !== familyId) return family;

      return {
        ...family,
        participants: normalizeParticipants(family.participants).map((participant) => (
          participant.id === participantId ? { ...participant, ...patch } : participant
        ))
      };
    }));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.main} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{tab[0].toUpperCase() + tab.slice(1)}</Text>
          </View>
          <Text style={styles.date}>{dateLabel}</Text>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CaseCard({ family, expanded, onExpand, onUpdate, onSyncParticipant, contactsReady }) {
  const isIntervention = family.type === "intervention";

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.caseHeader} onPress={onExpand}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(family.name)}</Text></View>
        <View style={styles.caseText}>
          <Text style={styles.cardTitle}>{family.name}</Text>
          <Text style={styles.muted}>{family.meta}</Text>
          <Text style={styles.caseMetaLine}>IP: {family.ipName || "Not set"} | Substance: {family.primarySubstance || "Not set"}</Text>
        </View>
        <Text style={styles.pill}>{family.status}</Text>
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.caseDetails}>
          <ParticipantsBlock family={family} onUpdate={onUpdate} onSyncParticipant={onSyncParticipant} contactsReady={contactsReady} />
          <EditableBlock title="IP name" value={family.ipName} onChange={(ipName) => onUpdate(family.id, { ipName })} />
          <EditableBlock title="Primary substance used" value={family.primarySubstance} onChange={(primarySubstance) => onUpdate(family.id, { primarySubstance })} />
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

function ParticipantsBlock({ family, onUpdate, onSyncParticipant, contactsReady }) {
  const [draft, setDraft] = useState(participantTemplate());
  const participants = normalizeParticipants(family.participants);

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addParticipant() {
    if (!draft.name.trim()) return;
    onUpdate(family.id, { participants: [...participants, { ...draft, name: draft.name.trim() }] });
    setDraft(participantTemplate());
  }

  function updateParticipant(participantId, patch) {
    onUpdate(family.id, {
      participants: participants.map((participant) => (
        participant.id === participantId ? { ...participant, ...patch, syncStatus: patch.contactId ? participant.syncStatus : "Needs sync" } : participant
      ))
    });
  }

  function removeParticipant(participantId) {
    onUpdate(family.id, { participants: participants.filter((participant) => participant.id !== participantId) });
  }

  return (
    <View style={styles.detailBlock}>
      <Text style={styles.blockTitle}>Participants</Text>
      {participants.map((participant) => (
        <View key={participant.id} style={styles.participantCard}>
          <TextInput style={styles.input} placeholder="Name" value={participant.name} onChangeText={(name) => updateParticipant(participant.id, { name })} />
          <TextInput style={styles.input} placeholder="Role" value={participant.role} onChangeText={(role) => updateParticipant(participant.id, { role })} />
          <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={participant.phone} onChangeText={(phone) => updateParticipant(participant.id, { phone })} />
          <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={participant.email} onChangeText={(email) => updateParticipant(participant.id, { email })} />
          <TextInput style={[styles.input, styles.textArea]} placeholder="Participant notes" value={participant.notes} onChangeText={(notes) => updateParticipant(participant.id, { notes })} multiline />
          <Row label="Contacts" value={participant.syncStatus || "Not synced"} tone={participant.syncStatus === "Synced" ? "green" : "blue"} />
          <View style={styles.formActions}>
            <TouchableOpacity style={[styles.actionButton, !contactsReady && styles.disabledButton]} onPress={() => onSyncParticipant(family.id, participant.id)}>
              <Text style={styles.actionText}>{participant.contactId ? "Update contact" : "Sync contact"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => removeParticipant(participant.id)}>
              <Text style={styles.cancelText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TextInput style={styles.input} placeholder="Participant name" value={draft.name} onChangeText={(name) => updateDraft({ name })} />
      <TextInput style={styles.input} placeholder="Role" value={draft.role} onChangeText={(role) => updateDraft({ role })} />
      <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={draft.phone} onChangeText={(phone) => updateDraft({ phone })} />
      <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={draft.email} onChangeText={(email) => updateDraft({ email })} />
      <TextInput style={[styles.input, styles.textArea]} placeholder="Participant notes" value={draft.notes} onChangeText={(notes) => updateDraft({ notes })} multiline />
      <TouchableOpacity style={styles.actionButton} onPress={addParticipant}>
        <Text style={styles.actionText}>Add participant</Text>
      </TouchableOpacity>
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
  main: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 30, fontWeight: "800", color: "#17211d" },
  date: { fontSize: 12, fontWeight: "700", color: "#68736e", marginBottom: 5 },
  toolbar: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingVertical: 14 },
  search: { flex: 1, borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, color: "#68736e", backgroundColor: "#fffdf8", fontWeight: "700" },
  plus: { width: 44, borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf8" },
  plusText: { fontSize: 26, color: "#17211d" },
  panel: { flex: 1, paddingHorizontal: 16 },
  panelContent: { paddingBottom: 120 },
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
  caseMetaLine: { color: "#68736e", fontSize: 11, fontWeight: "750", marginTop: 4 },
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
  disabledButton: { opacity: 0.55 },
  formCard: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 12, backgroundColor: "#fffdf8", marginBottom: 10 },
  formActions: { flexDirection: "row", gap: 8 },
  participantCard: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 10, backgroundColor: "#fffdf8", marginBottom: 10 },
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
  calendarList: { gap: 8, marginTop: 10, marginBottom: 10 },
  calendarChoice: { borderWidth: 1, borderColor: "#dbe2de", borderRadius: 8, padding: 11, backgroundColor: "#fffdf8" },
  calendarChoiceActive: { borderColor: "#2f6f5e", backgroundColor: "#d9ebe3" },
  calendarChoiceText: { color: "#68736e", fontWeight: "850" },
  calendarChoiceTextActive: { color: "#2f6f5e" },
  syncNote: { color: "#68736e", fontWeight: "750", fontSize: 12, marginTop: 8, marginBottom: 10 },
  empty: { color: "#68736e", fontWeight: "700", padding: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#dbe2de", borderRadius: 8 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#dbe2de", padding: 8, backgroundColor: "#fffdf8" },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#d9ebe3" },
  tabText: { fontSize: 11, color: "#68736e", fontWeight: "800" },
  tabTextActive: { color: "#2f6f5e" }
});
