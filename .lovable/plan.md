## Ziel
Multi-Tenant Modus mit Gruppen (Mandanten). Nur du (zennergilbert@gmail.com) hast als Super-Admin Zugriff auf ein Admin-Panel, um Gruppen und deren User zu verwalten. Jede Gruppe sieht nur ihre eigenen Aufnahmen. Alle User einer Gruppe haben identische Rechte auf deren Inhalte.

## Datenmodell (Datenbank)

Neue Tabellen:
- `groups` — Name, Slug, Notizen, aktiv/inaktiv
- `group_members` — verknüpft `auth.users` mit `groups`; ein User gehört zu genau einer Gruppe (Unique-Constraint auf user_id)
- `app_roles` (Enum: `super_admin`)
- `user_roles` — Super-Admin-Rollen (nur für dich); getrennte Tabelle, um Privilege Escalation zu verhindern

Bestehende Tabelle `recordings`:
- Neue Spalte `group_id uuid` (Foreign Key auf `groups`)
- Alle bestehenden Zeilen werden anhand des `user_id` in eine passende Gruppe migriert (bzw. gelöscht, falls keine — Tabelle ist aktuell leer laut vorheriger Prüfung)

Security-Definer-Funktionen:
- `is_super_admin(uid)` — prüft `user_roles`
- `current_group_id(uid)` — liefert die Gruppe des Users
- `has_group_access(uid, group_id)` — true wenn User Mitglied ODER Super-Admin

## RLS-Policies (überarbeitet)

`recordings`:
- SELECT/INSERT/UPDATE/DELETE: erlaubt wenn `has_group_access(auth.uid(), group_id)`
- Beim Insert wird `group_id` automatisch per Trigger aus `group_members` gesetzt (kein Client-Input)
- Super-Admin sieht alles

`groups`, `group_members`, `user_roles`:
- Nur Super-Admin kann verwalten
- User dürfen ihre eigene Gruppenzugehörigkeit lesen

`storage.objects` (Bucket `recordings`):
- Pfad wird von `{user_id}/...` auf `{group_id}/...` umgestellt
- Policies erlauben Zugriff wenn `has_group_access` auf den group_id-Präfix zutrifft

## Super-Admin-Bootstrap

Trigger auf `auth.users`: Wenn eine bestätigte E-Mail exakt `zennergilbert@gmail.com` ist, wird automatisch die `super_admin`-Rolle vergeben (nur für verifizierte E-Mails, wie in der Security-Guidance beschrieben).

## Server-Funktionen (neu, `src/lib/admin.functions.ts`)

Alle mit `requireSupabaseAuth` + Super-Admin-Check:
- `listGroups`, `createGroup`, `updateGroup`, `deleteGroup`
- `listGroupMembers(groupId)`
- `inviteUserToGroup(email, groupId)` — legt User via Auth Admin API an (mit temporärem Passwort oder Magic Link), fügt zu `group_members` hinzu
- `removeUserFromGroup(userId)`
- `resetUserPassword(userId)` — sendet Reset-Mail

Diese laden `supabaseAdmin` erst innerhalb des Handlers (nach dem Rollen-Check), gemäß Server-Function-Regeln.

## Registrierung

Public Signup wird deaktiviert. User können sich nur einloggen — Accounts werden ausschließlich vom Super-Admin im Admin-Panel angelegt. Google-Login bleibt aktiv, aber der Google-User muss vom Admin vorher zu einer Gruppe hinzugefügt worden sein; sonst zeigt die App "Kein Zugriff — bitte Admin kontaktieren".

## UI

Neue Route `src/routes/admin.tsx` (nur für Super-Admin sichtbar/erreichbar):
- Sektion **Gruppen**: Liste, anlegen, umbenennen, löschen
- Sektion **Detailansicht Gruppe**: Mitglieder-Liste, neuen User per E-Mail hinzufügen (Passwort/Email-Invite), User entfernen, Passwort-Reset-Mail senden
- Sektion **Aufnahmen pro Gruppe** (optional): Übersicht wie viele Recordings pro Gruppe

Header/Nav:
- Admin-Link erscheint nur für Super-Admin
- Für normale User in einer Gruppe: unveränderte UX
- Für eingeloggte User **ohne** Gruppenzugehörigkeit: Sperrbildschirm "Warte auf Freischaltung durch Admin"

`AuthPage`: "Create account"-Tab wird entfernt/deaktiviert; nur Sign-In (Email + Google).

## Migration bestehender Daten
- `recordings`-Tabelle ist aktuell leer → keine Datenmigration nötig
- Storage-Bucket wird geleert (keine relevanten Objekte vorhanden)

## Sicherheitsprinzipien
- Rollen in separater `user_roles`-Tabelle (nicht auf Profil)
- `has_role`/`is_super_admin` als SECURITY DEFINER, um Rekursion zu vermeiden
- Super-Admin-Zuweisung nur bei verifizierter Zieldomain/E-Mail
- Alle Admin-Server-Funktionen prüfen den Aufrufer serverseitig
- Storage-Pfade und Recordings via `group_id`, nicht `user_id`

## Offene Frage
Beim Anlegen eines Users: Willst du (a) ein temporäres Passwort setzen und dem User mitteilen, oder (b) einen Magic-Link/Invite per E-Mail schicken lassen? Default-Vorschlag: (b) Invite per E-Mail.
