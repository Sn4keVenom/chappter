// src/components/DemoRoleSwitcher.tsx
//
// Demo Mode only. Swaps the signed-in identity between the curated mock users
// so every role-gated surface can be exercised without a real account —
// carried over from the mobile app's Profile-tab banner, moved into the shell
// so it's reachable from anywhere rather than only from one tab.

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChoiceList } from "./ui/Form";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { DEMO_SWITCHABLE_USERS } from "../mocks/identity";
import { switchDemoUser } from "../mocks/bootstrap";
import { useAuthStore } from "../store/useAuthStore";
import { useMessagesStore } from "../store/useMessagesStore";
import { usePointsStore } from "../store/usePointsStore";
import styles from "./DemoRoleSwitcher.module.css";

export function DemoRoleSwitcher() {
  const navigate = useNavigate();
  const currentId = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentId ?? "u1");

  const options = DEMO_SWITCHABLE_USERS.map(({ user, blurb }) => ({
    value: user.id,
    label: `${user.firstName} ${user.lastName} — ${user.role}`,
    hint: blurb,
  }));

  const current = DEMO_SWITCHABLE_USERS.find((u) => u.user.id === currentId)?.user;

  function apply() {
    switchDemoUser(selected);
    // Per-user caches would otherwise show the previous identity's data —
    // including private DMs — until each store happened to refetch.
    useMessagesStore.getState().reset();
    usePointsStore.getState().resetLedger();
    setOpen(false);
    // Land on Home: the previous route may be one this role can't access.
    navigate("/");
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setSelected(currentId ?? "u1");
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <span>🎭 Demo — {current ? current.role : "viewing"}</span>
        <span className={styles.chevron} aria-hidden="true">
          Switch
        </span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Switch demo role"
        subtitle="View the app as a different mock user to see role-gated features — the Admin area, dues management, committee scope, and so on."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={apply}>
              View as this user
            </Button>
          </>
        }
      >
        <ChoiceList legend="Demo user" options={options} value={selected} onChange={setSelected} />
      </Dialog>
    </div>
  );
}
