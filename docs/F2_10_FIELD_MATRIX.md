# F.2.10 field-level parity matrix

No authorized real DEM is available. Every data row therefore remains evidence-ready but `NOT_RUN`; no synthetic value is presented as parser output.

| Category   | Fields                                                                                               | Python  | WASM          | Parity        | Tolerance                                             | Canonical |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------- | ------------- | ------------- | ----------------------------------------------------- | --------- |
| Header     | map/version/server/client/playback ticks/tickrate/patch                                              | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Players    | Steam ID/name/team number/additional native fields                                                   | NOT_RUN | NOT_AVAILABLE | NOT_AVAILABLE | exact                                                 | BLOCKED   |
| Events     | discovered names/count/order/duplicates                                                              | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Death      | attacker/victim/assister/weapon/headshot/noscope/blind/penetration/distance/position/tick/round/time | NOT_RUN | NOT_RUN       | NOT_RUN       | exact; documented numeric for position only if proven | BLOCKED   |
| Hurt       | attacker/victim/weapon/health damage/armor damage/tick/round/time/position                           | NOT_RUN | NOT_RUN       | NOT_RUN       | exact; documented numeric for position only if proven | BLOCKED   |
| Flash      | attacker/victim/duration/tick/round/time                                                             | NOT_RUN | NOT_RUN       | NOT_RUN       | exact; documented time tolerance only if proven       | BLOCKED   |
| Bomb       | plant/abort/defuse/explode/drop/pickup/beep sequence and actor/position                              | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Grenades   | entity/type/name/Steam ID/tick/X/Y/Z and lifecycle                                                   | NOT_RUN | NOT_RUN       | NOT_RUN       | exact; documented numeric for position only if proven | BLOCKED   |
| Weapons    | active/name/ammo/fire/empty/reload/zoom/purchase/equip/pickup/remove                                 | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Economy    | balance/start/spend/equipment/purchases                                                              | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Position   | X/Y/Z and velocity vectors                                                                           | NOT_RUN | NOT_RUN       | NOT_RUN       | documented numeric only if proven                     | BLOCKED   |
| Aim        | pitch/yaw/punch/shots/scoped/active weapon                                                           | NOT_RUN | NOT_RUN       | NOT_RUN       | documented numeric only if proven                     | BLOCKED   |
| State      | health/armor/alive/life/airborne/crouch/walk/strafe/movement                                         | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Rounds     | starts/ends/numbers/winner evidence/duration                                                         | NOT_RUN | NOT_RUN       | NOT_RUN       | exact; documented time tolerance only if proven       | BLOCKED   |
| Tick probe | identity/position/velocity/aim/state/weapon/economy/time/round/side/movement                         | NOT_RUN | NOT_RUN       | NOT_RUN       | field-specific                                        | BLOCKED   |
| Score      | native score only                                                                                    | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |
| Teams      | slot/side/identity/clan name kept separate                                                           | NOT_RUN | NOT_RUN       | NOT_RUN       | exact                                                 | BLOCKED   |

The executable parity contract retains 22 dimensions and supports `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`, `NOT_AVAILABLE_ON_WASM`, `NOT_AVAILABLE_ON_PYTHON`, and `PARSE_FAILED`. Missing, null, unavailable and failed values are never normalized into equality.
