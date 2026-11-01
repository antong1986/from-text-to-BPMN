---
name: BPMN DI waypoint serialization
description: bpmn-moddle details to preserve when rewriting BPMN edge geometry.
---

When rewriting BPMN DI edges with bpmn-moddle, waypoint points use the `dc:Point` type, not `di:Point`. `toXML` may add an XML declaration; normalize serialized output before passing it to validation that expects the BPMN root at the start of the string.

Recognize gateway nodes by a case-insensitive gateway token in either the BPMN type or element ID, including IDs with suffixes. If a recognized gateway's bounds omit a positive width or height, use 50 px for the missing dimension before calculating its center or serializing the corrected diagram.

For corrected main-axis routes, keep the source waypoint exactly on the source's right boundary. Place the target waypoint 1 px outside a task's left boundary and 2 px outside a gateway's left boundary; use that inset consistently for direct routes and orthogonal detours.

**Why:** The moddle schema's type namespace differs from the XML element prefix, the application's strict validator checks the root position, model-generated gateway IDs or bounds may be incomplete, and rendered arrowheads can appear covered at exact target bounds.

**How to apply:** Create replacement waypoint objects as `dc:Point`, detect gateway names without requiring an exact suffix match, fill only missing gateway dimensions with 50 px, apply the small target inset to every final route segment, serialize through bpmn-moddle, then run the existing XML cleanup before validation.
