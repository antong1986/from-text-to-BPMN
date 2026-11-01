---
name: BPMN DI waypoint serialization
description: bpmn-moddle details to preserve when rewriting BPMN edge geometry.
---

When rewriting BPMN DI edges with bpmn-moddle, waypoint points use the `dc:Point` type, not `di:Point`. `toXML` may add an XML declaration; normalize serialized output before passing it to validation that expects the BPMN root at the start of the string.

**Why:** The moddle schema's type namespace differs from the XML element prefix, and the application's strict validator checks the root position.

**How to apply:** Create replacement waypoint objects as `dc:Point`, serialize through bpmn-moddle, then run the existing XML cleanup before validation.
