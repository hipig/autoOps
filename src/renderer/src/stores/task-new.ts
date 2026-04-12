import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Task, TaskTemplate } from '../../../shared/task'
import type { FeedAcSettingsV2 } from '../../../shared/feed-ac-setting'
import { getDefaultFeedAcSettings } from '../../../shared/feed-ac-setting'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const templates = ref<TaskTemplate[]>([])
  const currentTaskId = ref<string | null>(null)

  async function loadTasks() {
    tasks.value = await window.api.taskCRUD.getAll() as Task[]
  }

  async function loadTemplates() {
    templates.value = await window.api['task-template'].getAll() as TaskTemplate[]
  }

  async function createTask(name: string, accountId: string, config?: FeedAcSettingsV2) {
    const task = await window.api.taskCRUD.create({ name, accountId, config }) as Task
    tasks.value.push(task)
    return task
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    const updated = await window.api.taskCRUD.update(id, updates) as Task | null
    if (updated) {
      const index = tasks.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tasks.value[index] = updated
      }
    }
    return updated
  }

  async function deleteTask(id: string) {
    await window.api.taskCRUD.delete(id)
    tasks.value = tasks.value.filter((t) => t.id !== id)
  }

  async function duplicateTask(id: string) {
    const newTask = await window.api.taskCRUD.duplicate(id) as Task | null
    if (newTask) {
      tasks.value.push(newTask)
    }
    return newTask
  }

  async function saveAsTemplate(name: string, config: FeedAcSettingsV2) {
    const template = await window.api['task-template'].save(name, config) as TaskTemplate
    templates.value.push(template)
    return template
  }

  async function deleteTemplate(id: string) {
    await window.api['task-template'].delete(id)
    templates.value = templates.value.filter((t) => t.id !== id)
  }

  function setCurrentTask(id: string | null) {
    currentTaskId.value = id
  }

  function getTaskById(id: string): Task | undefined {
    return tasks.value.find((t) => t.id === id)
  }

  function getTasksByAccount(accountId: string): Task[] {
    return tasks.value.filter((t) => t.accountId === accountId)
  }

  return {
    tasks,
    templates,
    currentTaskId,
    loadTasks,
    loadTemplates,
    createTask,
    updateTask,
    deleteTask,
    duplicateTask,
    saveAsTemplate,
    deleteTemplate,
    setCurrentTask,
    getTaskById,
    getTasksByAccount
  }
})
