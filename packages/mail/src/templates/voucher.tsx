import { Heading, Hr, Section, Text } from "react-email";

import { EmailLayout } from "../components/email-layout";

export interface VoucherEmailProps {
  /** Human plan name, e.g. "1 Day · 1 Device" */
  planName: string;
  /** Formatted price, e.g. "₦150.00" */
  priceLabel: string;
  /** Human validity label, e.g. "1 day" */
  validityLabel: string;
  /** Devices allowed by the plan */
  deviceCount: number;
  /** The paid plan voucher code */
  code: string;
  /** The repurchase bonus code, when one was minted */
  bonusCode?: string;
  /** Optional support line */
  supportPhone?: string;
}

/**
 * Receipt-style voucher delivery email. Sent on order fulfilment when the
 * buyer left an email address. Deliberately text-first: buyers often open it
 * on the captive-portal device before they have internet.
 */
export const VoucherEmail = ({
  planName,
  priceLabel,
  validityLabel,
  deviceCount,
  code,
  bonusCode,
  supportPhone,
}: VoucherEmailProps) => (
  <EmailLayout preview="Your WiFi voucher code is inside">
    <Section className="rounded-lg bg-white p-8">
      <Heading className="text-foreground m-0 mb-4 text-2xl font-bold">
        Your voucher is ready
      </Heading>

      <Text className="text-muted-foreground mb-6 text-base">
        Thanks for your purchase. Here is everything you need to get online.
      </Text>

      <Section className="bg-muted mb-6 rounded-lg py-6 text-center">
        <Text className="text-muted-foreground m-0 mb-2 text-xs font-semibold uppercase">
          Your WiFi code
        </Text>
        <Text className="text-foreground m-0 font-mono text-3xl font-bold tracking-[0.25em]">
          {code}
        </Text>
      </Section>

      <Text className="text-muted-foreground mb-4 text-base">
        Enter this code as both the username and password on the WiFi login
        page.
      </Text>

      <Hr className="border-border my-6" />

      <Heading className="text-foreground m-0 mb-4 text-lg font-semibold">
        Receipt
      </Heading>
      <Text className="text-muted-foreground m-0 mb-6 text-base">
        Plan: {planName}
        <br />
        Validity: {validityLabel}
        <br />
        Devices: {deviceCount}
        <br />
        Amount paid: {priceLabel}
      </Text>

      {bonusCode ? (
        <>
          <Hr className="border-border my-6" />
          <Section className="bg-muted mb-6 rounded-lg py-4 text-center">
            <Text className="text-muted-foreground m-0 mb-1 text-xs font-semibold uppercase">
              Bonus code · 5 free minutes
            </Text>
            <Text className="text-foreground m-0 font-mono text-xl font-bold tracking-[0.25em]">
              {bonusCode}
            </Text>
          </Section>
          <Text className="text-muted-foreground mb-4 text-sm">
            When your data finishes, use this bonus code once to get back online
            and buy a new plan.
          </Text>
        </>
      ) : null}

      <Hr className="border-border my-6" />

      <Text className="text-muted-foreground m-0 text-sm">
        How to use your voucher: connect to the{" "}
        <span className="text-foreground font-semibold">Saleslip WiFi</span>{" "}
        network, open the login page, and enter your code.
        {supportPhone ? ` Need help? Call ${supportPhone}.` : ""}
      </Text>
    </Section>
  </EmailLayout>
);

export default VoucherEmail;
