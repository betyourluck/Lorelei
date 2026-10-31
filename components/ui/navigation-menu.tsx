"use client";

import { Menu, MenuButton, MenuList, MenuItem, Button } from "@yamada-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/components/i18n";

const NAV_ITEMS = [
  { label: "nav.flowchart", path: "/flow-chart" },
  { label: "nav.er", path: "/er-diagram" },
] as const;

export const NavigationMenu = () => {
  const { t } = useTranslation();
  const pathname = usePathname() ?? "";
  // '/' の時はフローチャートを選択中とみなす
  const isRoot = pathname === "/";
  const current = isRoot
    ? NAV_ITEMS.find((item) => item.path === "/flow-chart")
    : NAV_ITEMS.find((item) => pathname.startsWith(item.path));

  // 現在のルート以外のみをメニューに表示
  const menuItems = NAV_ITEMS.filter(
    (item) => !(isRoot ? item.path === "/flow-chart" : pathname.startsWith(item.path))
  );

  return (
    <Menu>
      <MenuButton as={Button} variant="outline" size="sm" ml={{ base: 0, sm: "auto" }}>
        {current ? t(current.label) : t("nav.choose")}
      </MenuButton>
      <MenuList>
        {menuItems.map((item) => (
          <MenuItem key={item.path} as={Link} href={pathname !== "" ? item.path : "#"}>
            {t(item.label)}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
