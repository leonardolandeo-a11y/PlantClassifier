export function Header({section}: {section: string}) {
  return <header className="header"><div><span className="breadcrumb">Workspace</span><span className="breadcrumb-divider">/</span><span>{section}</span></div><span className="header-tag"><span aria-hidden="true">◌</span> Estación de cultivo</span></header>;
}
