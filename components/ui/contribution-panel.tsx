import { Panel } from "@xyflow/react";
import { CircleDotIcon, CodeIcon, GithubIcon } from "@yamada-ui/lucide";
import { Menu, MenuButton, MenuList, MenuItem, IconButton, Link } from "@yamada-ui/react";

/** 既定のリポジトリ。フォークで Web 版を配る時は、ビルド時に NEXT_PUBLIC_REPOSITORY_URL で差し替える */
const DEFAULT_REPOSITORY_URL = "https://github.com/illionillion/mermaid-editor";
const repositoryUrl = () => process.env.NEXT_PUBLIC_REPOSITORY_URL || DEFAULT_REPOSITORY_URL;

export const ContributionPanel = () => {
  return (
    <Panel position="top-right">
      <ContributionPanelContent />
    </Panel>
  );
};

export const ContributionPanelContent = () => {
  const repository = repositoryUrl();
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        icon={<GithubIcon />}
        size="sm"
        aria-label="コントリビューションメニュー"
        bg="gray.600"
        color="white"
        _hover={{ bg: "black", textDecoration: "none" }}
      />
      <MenuList>
        <MenuItem
          as={Link}
          href={repository}
          target="_blank"
          rel="noopener noreferrer"
          icon={<CodeIcon />}
        >
          リポジトリを見る
        </MenuItem>
        <MenuItem
          as={Link}
          href={`${repository}/issues/new/choose`}
          target="_blank"
          rel="noopener noreferrer"
          icon={<CircleDotIcon />}
        >
          Issueを作成
        </MenuItem>
      </MenuList>
    </Menu>
  );
};
