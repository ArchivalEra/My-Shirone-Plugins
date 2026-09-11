# What-Im-Doing Fleet

Multi-device activity collection, serverless edge ingestion, and telemetry distribution for personal infrastructure fleets.

## Language

**Fleet**:
The entire set of heterogeneous computing devices registered to report activity telemetry to the edge hub.
_Avoid_: Cluster, network, swarm

**Device**:
A distinct physical or virtual machine identified by a unique `deviceId` and categorized by hardware role (`desktop`, `laptop`, `server`).
_Avoid_: Host, client, node

**Device Token**:
A high-entropy secret token allocated to a single device for authenticating telemetry reports.
_Avoid_: API key, session token, bearer password

**Activity Report**:
A single snapshot of running state emitted by a device, containing current window caption, active application, status code, and timestamp.
_Avoid_: Heartbeat, log entry, event packet

**Last Seen**:
The high-precision millisecond timestamp marking the most recent verified activity report from a device; permanently preserved when the device enters offline state.
_Avoid_: Expiry time, ping time

**Edge Hub**:
The serverless edge function deployed on Cloudflare Workers that receives pushed telemetry and persists state in Cloudflare D1 SQL.
_Avoid_: Backend server, master node, gateway daemon

**Device Registry**:
The authoritative `devices` table in Cloudflare D1 storing device metadata, authorization tokens, and hardware types.
_Avoid_: User table, whitelist file

**Raw Activity Snapshot**:
The unprocessed array of device states returned by the edge hub, leaving ordering, filtering, and presentation to downstream consumers.
_Avoid_: Formatted feed, timeline view

**Provisioning UI**:
The minimal on-worker HTML interface at `GET /admin` protected by Cloudflare Zero Trust Access for registering devices and generating tokens.
_Avoid_: Admin dashboard, control panel
