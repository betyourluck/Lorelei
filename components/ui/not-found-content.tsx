"use client";

import { Link as UILink, Center, Heading, Text } from "@yamada-ui/react";
import Link from "next/link";
import { DocumentTitle, useTranslation } from "@/components/i18n";

/** 404 の本文 (spec 31 D7)。app/not-found.tsx は server component で hook を使えないので、言葉を持つ所を client に切り出した */
export const NotFoundContent = () => {
  const { t } = useTranslation();
  return (
    <Center as="main" gap="md" flexDir="column" width="full" height="100vh">
      <DocumentTitle titleKey="notFound.title" />
      <Heading as="h1">{t("notFound.heading")}</Heading>
      <Text>{t("notFound.body")}</Text>
      <UILink as={Link} href="/">
        {t("notFound.home")}
      </UILink>
    </Center>
  );
};
