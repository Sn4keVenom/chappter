// src/components/ui/DataTable.tsx
//
// One data set, two presentations, one column definition.
//
// Reproducing a desktop table on a phone is the single worst thing this
// migration could do — six columns squeezed into 360px is unreadable, and a
// horizontally scrolling table hides data behind a gesture people don't
// discover. So below 720px each row becomes a card with its fields stacked as
// label/value pairs; at 720px and up the same rows render as a real <table>
// with proper <th scope="col"> headers.
//
// Both branches are rendered and CSS decides which is visible. That costs a
// little markup, but it means no JavaScript viewport measurement, no layout
// shift on resize, and no chance of the two views disagreeing about content.

import { Link } from "react-router-dom";
import styles from "./DataTable.module.css";

export interface Column<Row> {
  /** Stable key; also used as the mobile field label unless `label` differs. */
  key: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  /** Right-aligned, tabular figures. For counts and money. */
  numeric?: boolean;
  /** Promoted to the card's title on mobile instead of a label/value row. */
  primary?: boolean;
  /** Rendered under the title on mobile, unlabelled. */
  secondary?: boolean;
  /** Omitted from the mobile card (redundant with the title, usually). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> {
  /** Describes the table for screen readers. Required. */
  caption: string;
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  /** Makes the whole row/card a link to this destination. */
  rowHref?: (row: Row) => string;
  /** Per-row action buttons. Rendered in a trailing cell / card footer. */
  rowActions?: (row: Row) => React.ReactNode;
  empty?: React.ReactNode;
}

export function DataTable<Row>({
  caption,
  rows,
  columns,
  rowKey,
  rowHref,
  rowActions,
  empty,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary = columns.find((c) => c.primary);
  const secondary = columns.find((c) => c.secondary);
  const fields = columns.filter((c) => !c.primary && !c.secondary && !c.hideOnMobile);

  return (
    <div className={styles.wrap}>
      {/* Mobile presentation */}
      <ul className={styles.cards}>
        {rows.map((row) => {
          const body = (
            <>
              {primary ? <div className={styles.cardPrimary}>{primary.render(row)}</div> : null}
              {secondary ? <div className={styles.cardSecondary}>{secondary.render(row)}</div> : null}
              <div className={styles.cardFields}>
                {fields.map((column) => (
                  <div className={styles.cardField} key={column.key}>
                    <span className={styles.cardFieldLabel}>{column.header}</span>
                    <span className={styles.cardFieldValue}>{column.render(row)}</span>
                  </div>
                ))}
              </div>
            </>
          );

          return (
            <li key={rowKey(row)}>
              {rowHref ? (
                <Link to={rowHref(row)} className={styles.card}>
                  {body}
                </Link>
              ) : (
                <div className={styles.card}>{body}</div>
              )}
              {rowActions ? (
                <div className={styles.cardActions}>{rowActions(row)}</div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Desktop presentation */}
      <div className={`${styles.table} scroll-x`}>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.numeric ? styles.numeric : undefined}>
                  {column.header}
                </th>
              ))}
              {rowActions ? (
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={rowHref ? styles.rowInteractive : undefined}>
                {columns.map((column, index) => (
                  <td key={column.key} className={column.numeric ? styles.numeric : undefined}>
                    {/* The link lives on the first cell's content rather than
                        wrapping the row: <a> is not valid inside <tr>, and a
                        row-level onClick would be invisible to the keyboard. */}
                    {index === 0 && rowHref ? (
                      <Link to={rowHref(row)}>{column.render(row)}</Link>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
                {rowActions ? <td className={styles.actionsCell}>{rowActions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
