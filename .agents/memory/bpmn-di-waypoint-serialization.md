---
name: BPMN DI waypoint serialization
description: bpmn-moddle details to preserve when rewriting BPMN edge geometry.
---

When rewriting BPMN DI edges with bpmn-moddle, waypoint points use the `dc:Point` type, not `di:Point`. `toXML` may add an XML declaration; normalize serialized output before passing it to validation that expects the BPMN root at the start of the string.

Recognize supported main-axis nodes by BPMN task/gateway type or by IDs prefixed with Task, ServiceTask, UserTask, Gateway, ExclusiveGateway, ParallelGateway, or InclusiveGateway. If a recognized gateway's bounds omit a positive width or height, use 50 px for the missing dimension before calculating its center or serializing the corrected diagram.

For corrected main-axis routes, keep the source waypoint exactly on the source's right boundary. Place every target waypoint 2 px before the target's left boundary and use that inset consistently for direct routes and orthogonal detours.

**Why:** The moddle schema's type namespace differs from the XML element prefix, the application's strict validator checks the root position, model-generated element IDs or bounds may be incomplete, and rendered arrowheads can appear covered at exact target bounds.

**How to apply:** Create replacement waypoint objects as `dc:Point`, recognize supported node ID prefixes and gateway names without requiring an exact suffix match, fill only missing gateway dimensions with 50 px, apply the 2 px target inset to every final route segment, serialize through bpmn-moddle, then run the existing XML cleanup before validation.
