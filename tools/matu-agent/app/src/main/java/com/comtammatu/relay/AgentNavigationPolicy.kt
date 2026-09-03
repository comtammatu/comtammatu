/** Pure navigation decisions shared by MainActivity and unit tests. */
object AgentNavigationPolicy {
    /**
     * Material NavigationBarView.setSelectedItemId invokes the item-selected
     * listener before selectedItemId updates. The listener must ignore that
     * callback or selectDestination re-enters and overflows the stack.
     */
    fun shouldHandleItemSelection(applyingProgrammaticSelection: Boolean): Boolean =
        !applyingProgrammaticSelection
}
