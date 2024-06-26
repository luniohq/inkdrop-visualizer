import { useState } from "react";
import Sidebar from "../sidebar/Sidebar";
import { Dependency, moduleDependencies, resourceDependencies } from "../dependencies/dependencies";
import { NodeGroup, TFVariableOutput } from "../TLDWrapper";
import DependencyUI from "../dependencies/DependenciesUI";
import { Editor, TLShapeId } from "@tldraw/tldraw";
import { computeShading, resetShading } from "../editorHandler/shading";
import { ChangesBreakdown, getChangesBreakdown, nodeChangesToString } from "../jsonPlanManager/jsonPlanManager";
import EditorHandler from "../editorHandler/EditorHandler";
import { getMacroCategory } from "../utils/awsCategories";

interface SelectionHandlerProps {
    editor: Editor,
    nodeGroups: NodeGroup[] | undefined
    sidebarWidth: number
    setShowSidebar: (showSidebar: boolean) => void
    shapesSnapshot: string
    hasPlanJson: boolean
    variables: TFVariableOutput[]
    outputs: TFVariableOutput[]
}

const SelectionHandler = ({
    editor,
    nodeGroups,
    sidebarWidth,
    setShowSidebar,
    shapesSnapshot,
    hasPlanJson,
    variables,
    outputs
}: SelectionHandlerProps) => {
    const [selectedNode, setSelectedNode] = useState<NodeGroup | undefined>()
    const [selectedModule, setSelectedModule] = useState<string>("")
    const [currentShapeId, setCurrentShapeId] = useState<string>("")
    const [moduleDrilldownData, setModuleDrilldownData] = useState<{ category: string, textToShow: string, changesBreakdown: ChangesBreakdown }[]>([])
    const [diffText, setDiffText] = useState<string>("")
    const [dependencies, setDependencies] = useState<Dependency[]>([])
    const [affected, setAffected] = useState<Dependency[]>([])
    const [selectedResourceId, setSelectedResourceId] = useState<string>("")
    const [showAll, setShowAll] = useState<boolean>(false)

    const closeSidebar = () => {
        handleShapeSelectionChange("")
        editor.selectNone()
    }

    const processModuleChanges = (moduleChanges: { category: string, resourceChanges: any[] }[], newShowAllValue?: boolean) => {
        const categories = Array.from(new Set(moduleChanges.map((moduleChange) => moduleChange.category)))
        return categories.map((category) => {
            const resourceChanges = moduleChanges.filter((moduleChange) => moduleChange.category === getMacroCategory(category)).map((moduleChange) => moduleChange.resourceChanges).flat()
            const changesBreakdown = getChangesBreakdown(resourceChanges)
            const { textToShow } = nodeChangesToString(resourceChanges,
                newShowAllValue !== undefined ? newShowAllValue : showAll)
            return {
                category,
                textToShow,
                changesBreakdown
            }
        })
    }

    const isNestedChildOfFrame = (nodeFrameId: string, frameId: string): boolean => {
        if (!nodeFrameId) return false
        if (nodeFrameId === frameId) {
            return true
        }
        const parentFrame = editor.getShapeParent(nodeFrameId as TLShapeId)
        if (parentFrame) {
            return isNestedChildOfFrame(parentFrame.id, frameId)
        }
        return false
    }

    const handleFrameSelection = (frameId: string, storedNodeGroups: NodeGroup[], newShowAllValue?: boolean) => {
        setSelectedNode(undefined)
        const childrenNodes = storedNodeGroups.filter((nodeGroup) => {
            return nodeGroup.frameShapeId && isNestedChildOfFrame(nodeGroup.frameShapeId, frameId)
        })
        const moduleName = (editor.getShape(frameId as TLShapeId)?.props as any).name || ""
        setSelectedModule(moduleName)
        const moduleChanges = childrenNodes.map((nodeGroup) => {
            return {
                category: getMacroCategory(nodeGroup.category),
                resourceChanges: nodeGroup.nodes.map((node) => node.resourceChanges || undefined).flat().filter((s) => s !== undefined)
            }
        })
        const moduleDrilldownData = processModuleChanges(moduleChanges, newShowAllValue)
        const { dependencies, affected } = moduleDependencies(storedNodeGroups, moduleName || "root_module", variables, outputs)
        setDependencies(dependencies)
        setAffected(affected)
        setModuleDrilldownData(moduleDrilldownData)

        setShowSidebar(true)
    }

    const handleShapeSelectionChange = (shapeId: string, newShowAllValue?: boolean) => {
        setCurrentShapeId(shapeId)
        const element = document.querySelector(".tlui-navigation-zone") as HTMLElement
        if (!hasPlanJson || shapeId === "") {
            setSelectedNode(undefined)
            setShowSidebar(false)
            setDependencies([])
            setAffected([])
            setSelectedModule("")
            setDiffText("")
            resetShading(editor!, shapesSnapshot)
            if (element)
                element.style.display = ""
        } else if (nodeGroups && editor) {
            if (element)
                element.style.display = "none"
            const shape = editor.getShape(shapeId as any)
            resetShading(editor!, shapesSnapshot)
            if (shape?.type === "frame") {
                handleFrameSelection(shapeId, nodeGroups, newShowAllValue)
            } else {
                // remove shape: prefix, and date suffix
                const shapeIdWithoutPrefixAndSuffix = shapeId.split(":")[1]
                const selectedNodeGroup = nodeGroups?.filter((nodeGroup) => {
                    return nodeGroup.id === shapeIdWithoutPrefixAndSuffix
                })[0]
                setModuleDrilldownData([])
                setSelectedNode(selectedNodeGroup)

                const { dependencies, affected } = resourceDependencies(nodeGroups, selectedNodeGroup, variables, outputs)
                setDependencies(dependencies)
                setAffected(affected)

                computeShading(selectedNodeGroup, nodeGroups, editor!, dependencies, affected)

                const { textToShow, resourceId } = nodeChangesToString(selectedNodeGroup.nodes.map((node) => {
                    return node.resourceChanges || undefined
                }).filter((s) => s !== undefined).flat(),
                    newShowAllValue !== undefined ? newShowAllValue : showAll)

                setShowSidebar(true)

                setDiffText(textToShow || "No changes detected")
                setSelectedResourceId(resourceId || "")
            }
        }
    }

    const handleShowAllChange = (showAll: boolean) => {
        setShowAll(showAll)
        handleShapeSelectionChange(currentShapeId, showAll)
    }

    return (
        <>
            {(selectedNode || selectedModule) && nodeGroups && editor &&
                <DependencyUI dependencies={dependencies}
                    affected={affected}
                    sidebarWidth={sidebarWidth}
                    nodeGroups={nodeGroups}
                    moduleName={selectedNode?.moduleName || selectedModule}
                    type={selectedNode ? "resource" : "module"}
                    editor={editor} />}
            {sidebarWidth > 0 &&
                <Sidebar width={sidebarWidth}
                    showAll={showAll}
                    moduleDrilldownData={moduleDrilldownData}
                    title={selectedNode?.name || selectedModule || ""}
                    text={diffText}
                    resourceId={selectedResourceId}
                    subtitle={selectedNode?.type || ""}
                    closeSidebar={() => closeSidebar()}
                    handleShowAllChange={handleShowAllChange}
                />
            }
            <EditorHandler
                editor={editor}
                handleShapeSelectionChange={handleShapeSelectionChange} />
        </>
    )
}

export default SelectionHandler;