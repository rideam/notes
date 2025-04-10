"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from 'next/cache';

export type Note = {
  id?: string
  title: string
  content?: string
  user_id?: string
}

export const signUpAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  if (!email || !password) {
    return encodedRedirect(
      "error",
      "/sign-up",
      "Email and password are required",
    );
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error(error.code + " " + error.message);
    return encodedRedirect("error", "/sign-up", error.message);
  } else {
    return encodedRedirect(
      "success",
      "/sign-up",
      "Thanks for signing up! Please check your email for a verification link.",
    );
  }
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return encodedRedirect("error", "/sign-in", error.message);
  }

  return redirect("/notes");
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get("email")?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callbackUrl = formData.get("callbackUrl")?.toString();

  if (!email) {
    return encodedRedirect("error", "/forgot-password", "Email is required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/notes/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect(
      "error",
      "/forgot-password",
      "Could not reset password",
    );
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    "success",
    "/forgot-password",
    "Check your email for a link to reset your password.",
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      "error",
      "/notes/reset-password",
      "Password and confirm password are required",
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect(
      "error",
      "/notes/reset-password",
      "Passwords do not match",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect(
      "error",
      "/notes/reset-password",
      "Password update failed",
    );
  }

  encodedRedirect("success", "/notes/reset-password", "Password updated");
};

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

/*
export async function getNotes() {
    const supabase = await createClient()

    // Get the current user
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return []
    }
    
    // Only fetch notes belonging to the current user
    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userData.user.id)
    
    if (error) {
      console.error('Error fetching notes:', error)
      return []
    }
    
    return notes;
}
*/

export async function getNotes() {
  "use server";
  try {

  const supabase = await createClient();
  
  // Get the current user
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("User not authenticated");
  }
  
  const { data: notes, error } = await supabase.rpc(
    'slow_get_notes',
    { p_user_id: userData.user.id }
  );
  
  // If there's a database error, throw it
  if (error) {
    console.error('Error fetching notes:', error);
    throw new Error("Failed to retrieve notes");
  }
  
  // Return the notes
  return notes;

  } catch (error) {
    console.error('Error in getNotes:', error);
    
    // Create a custom error with a generic message
    const clientError = new Error("Something went wrong while loading your notes. Please try again later.");
    
    // Rethrow the error with generic message for the client
    throw clientError;
  }
}

export async function createNote(formData: FormData) {
  const supabase = await createClient();
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  
  if (!title) {
    return { error: 'Title is required' }
  }
  
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { error: 'User not authenticated' }
  }
  
  // Create note object with available fields
  const noteData: { title: string; content?: string; user_id: string } = { 
    title, 
    content,
    user_id: userData.user.id
  }
  
  const { error } = await supabase.from('notes').insert(noteData)
  
  if (error) {
    console.error('Error creating note:', error);
    return { error: 'Error creating note' }
  }
  
  revalidatePath('/notes')
  return { success: true }
}

export async function updateNote(formData: FormData) {
  const supabase = await createClient()

  const id = formData.get('id') as string;
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  
  if (!id || !title) {
    return { error: 'ID and title are required' };
  }
  
  // Get the current user
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: 'User not authenticated' };
  }
  
  // Verify note ownership before update
  const { data: note } = await supabase
    .from('notes')
    .select('user_id')
    .eq('id', id)
    .single();
    
  if (!note) {
    return { error: 'Note not found' };
  }
  
  if (note.user_id !== userData.user.id) {
    return { error: 'You can only update your own notes' };
  }
  
  // Proceed with update after ownership verification
  const { error } = await supabase
    .from('notes')
    .update({ title, content })
    .eq('id', id)
    .eq('user_id', userData.user.id); 

    if (error) {
      console.error('Error updating note:', error);
      return { error: 'Error updating note' };
    }
  
  revalidatePath('/notes');
  return { success: true };

}


export  async function deleteNote(id: string) {
  const supabase = await createClient()

  if (!id) {
    return { error: 'ID is required' };
  }

  // Get the current user
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { error: 'User not authenticated' };
  }
  
  // Verify note ownership before deletion
  const { data: note } = await supabase
    .from('notes')
    .select('user_id')
    .eq('id', id)
    .single();
    
  if (!note) {
    return { error: 'Note not found' };
  }
  
  if (note.user_id !== userData.user.id) {
    return { error: 'You can only delete your own notes' };
  }
  
  // Proceed with deletion after ownership verification
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', userData.user.id);
  
  if (error) {
    console.error('Error deleting note:', error);
    return { error: 'Error deleting note' }
  }
  
  revalidatePath('/notes');
  return { success: true };
}