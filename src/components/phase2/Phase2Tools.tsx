import type { Phase2Props } from "./Phase2Ui";
import { Phase2Panel, RowLine, voiceSummary } from "./Phase2Ui";
import TradeTools from "./TradeTools";
import OperationsTools from "./OperationsTools";
import FinanceTools from "./FinanceTools";
import { useLanguage } from "../../i18n";
import { shortDate, timeOf } from "../../lib/format";
import { openRecord } from "./Phase2Ui";

const FINANCE_MODULES = new Set(["invoices", "payments", "compliance", "dashboard", "analytics", "intelligence", "search"]);

function ActivityTimeline({ props }: { props: Phase2Props }) {
  const { t } = useLanguage();
  const { state, setTab } = props;
  const entries = [
    ...state.activity.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      when: `${shortDate(item.timestamp)} · ${timeOf(item.timestamp)}`,
      module: "dashboard",
      recordId: "",
      tone: item.tone,
    })),
    ...state.orders.slice(0, 4).map((order) => ({
      id: `order-${order.id}`, title: t("Order {number}", { number: order.number }),
      detail: t("Status: {status}", { status: order.status.replace(/_/g, " ") }),
      when: shortDate(order.date), module: "orders", recordId: order.id, tone: "info" as const,
    })),
    ...state.invoices.slice(0, 4).map((invoice) => ({
      id: `invoice-${invoice.id}`, title: t("Invoice {number}", { number: invoice.number }),
      detail: t("{paid} settled of {total}", { paid: invoice.paidAmount, total: invoice.amount }),
      when: shortDate(invoice.issueDate), module: "invoices", recordId: invoice.id, tone: "success" as const,
    })),
    ...state.shipments.slice(0, 4).map((shipment) => ({
      id: `shipment-${shipment.id}`, title: t("Shipment {reference}", { reference: shipment.reference }),
      detail: t("Delay risk: {risk}", { risk: shipment.delayRisk }),
      when: shortDate(shipment.eta), module: "shipments", recordId: shipment.id, tone: shipment.delayRisk === "high" ? "danger" as const : "info" as const,
    })),
  ].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 12);

  return (
    <Phase2Panel title={t("Activity timeline")} description={t("A single local view of what changed across modules.")}>
      <div className="phase2-rows">
        {entries.map((entry) => (
          <RowLine
            key={entry.id}
            title={entry.title}
            meta={`${entry.when} · ${entry.detail}`}
            trailing={<button type="button" className="link-button" onClick={() => entry.recordId ? openRecord(entry.module, entry.recordId, setTab) : setTab(entry.module)}>{t("Open")}</button>}
          />
        ))}
      </div>
    </Phase2Panel>
  );
}

export default function Phase2Tools(props: Phase2Props) {
  const { t } = useLanguage();
  const showTimeline = props.module === "dashboard" || props.module === "intelligence";
  const showGenericVoice = !FINANCE_MODULES.has(props.module);

  return (
    <div className="phase2-stack">
      {showGenericVoice && (
        <div className="phase2-voice-bar">
          <span className="muted-text">{t("Need a spoken overview? The summary reads this module's local records.")}</span>
          <button type="button" className="button subtle" onClick={() => voiceSummary(props.module)}>{t("Voice summary")}</button>
        </div>
      )}
      {showTimeline && <ActivityTimeline props={props} />}
      <TradeTools {...props} />
      <OperationsTools {...props} />
      <FinanceTools {...props} />
    </div>
  );
}
