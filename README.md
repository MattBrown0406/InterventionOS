# InterventionOS

Native Expo draft for intervention and coaching case management.

## Setup

The Expo scaffold command was not approved in this environment, so this local project was created manually with the EAS project id already in `app.json`.

When ready to install dependencies:

```sh
cd interventionos
npm install
npx eas-cli init --id e9c1db37-f9a4-4596-88b8-c99abdf9bc61
npm run start
```

## Current Features

- Intervention and Coaching case pipelines
- Add family with case amount and payment status
- Expandable family files with editable participants, contacts, notes, focus, and documents
- Archive and restore families from Admin
- Schedule and Tasks split
- Automatic Google Calendar sync labeling for schedule entries and tasks
- Revenue dashboard for MTD/YTD collected and owed totals
