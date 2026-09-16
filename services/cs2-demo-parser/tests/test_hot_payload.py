from hot_payload import HOT_LIMITS, build_hot_payload


def test_hot_payload_is_bounded_and_marks_overflow():
    events = [{"type": "player_death", "tick": index} for index in range(HOT_LIMITS["combat_events"] + 7)]
    hot = build_hot_payload(
        {"header": {"map": "de_cache"}, "players": [], "rounds": [], "events": events, "warnings": []},
        parser={"name": "demoparser2", "version": "0.42.0", "revision": "git:" + "a" * 40},
        contract_version=1, demo_sha256="b" * 64, upload_id="upload",
    )
    assert len(hot["combat_events"]) == HOT_LIMITS["combat_events"]
    quality = hot["quality"]["sections"]["combat_events"]
    assert quality == {"status": "limited", "observed_rows": HOT_LIMITS["combat_events"] + 7,
                       "included_rows": HOT_LIMITS["combat_events"], "limit": HOT_LIMITS["combat_events"],
                       "overflow_rows": 7}
    assert hot["quality"]["partial"] is True
    assert "raw_evidence" not in hot and "grenade_samples" not in hot