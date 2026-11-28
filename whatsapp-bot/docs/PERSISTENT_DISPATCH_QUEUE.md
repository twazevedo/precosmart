# Persistent WhatsApp dispatch queue

This module introduces a durable queue in a **new MongoDB collection** named `dispatch_queue`.
It does not read, write, migrate, or delete the WhatsApp `auth_info` collection.

## Job lifecycle

`pending → processing → sent`

Temporary failures return to `pending` with exponential backoff. Permanent failures and exhausted retries become `failed`. A worker lease allows another process to reclaim a job after a worker disappears.

## Safety and integration status

- This is the persistence foundation; existing bot send paths are not switched to it in this first isolated change.
- Do not enable the queue in production until the next integration stage routes all offer producers through one dispatcher.
- Keep WhatsApp session storage separate. Never use queue recovery as a reason to clear or regenerate `auth_info`.
- A network timeout can leave send outcome ambiguous. Before automatic resend, the integration must add a message-level idempotency/reconciliation strategy; queue retries alone cannot guarantee exactly-once delivery.

## Tests

Run with `npm test`. The tests use an in-memory collection double and do not connect to MongoDB or WhatsApp.
