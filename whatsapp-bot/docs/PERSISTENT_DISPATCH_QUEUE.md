# Persistent WhatsApp dispatch queue

This module introduces a durable queue in a **new MongoDB collection** named `dispatch_queue`.
It does not read, write, migrate, or delete the WhatsApp `auth_info` collection.

## Job lifecycle

`pending → processing → sent`

Temporary failures detected before a send attempt return to `pending` with exponential backoff. Permanent failures and exhausted retries become `failed`. If `sendMessage` rejects after an attempt begins, the job becomes `uncertain` and is not automatically retried: a timeout can occur after WhatsApp accepted the message, so retrying could publish a duplicate. A worker lease allows another process to reclaim a job after a worker disappears.

## Safety and integration status

- `dispatchManager.js` adds a single-target worker abstraction and enqueues one job per WhatsApp group, using a target-scoped idempotency key.
- The manager is not yet wired into `bot.js`; existing send paths remain unchanged. Do not enable it in production until the integration stage is complete and verified.
- Keep WhatsApp session storage separate. Never use queue recovery as a reason to clear or regenerate `auth_info`.
- Baileys resolving `sendMessage` means the message was submitted to the socket; it does not prove delivery or reading. The manager records that distinction.

## Tests

Run with `npm test`. The tests use an in-memory collection double and do not connect to MongoDB or WhatsApp.
